import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { allUsers as initialUsers } from "@/mocks/data";
import { db } from "@/backend/db";
import type { User, UserRole, UserStatus } from "@/types";

const COLLECTION = "users";
const MAX_IMAGE_DATA_URI_LENGTH = 300_000;
const DEFAULT_AVATAR = "https://api.dicebear.com/9.x/fun-emoji/png?seed=Bear&backgroundColor=c0aede";
const ALLOWED_AVATAR_PREFIX = "https://api.dicebear.com/9.x/fun-emoji/png";
const ENABLE_DEFAULT_SEEDING = (process.env.ENABLE_DEFAULT_SEEDING || "false") === "true";
let initialized = false;
let usersCache: User[] = [];

function validateAvatar(avatar?: string) {
  if (!avatar) return;
  if (avatar.startsWith("data:image/") && avatar.length > MAX_IMAGE_DATA_URI_LENGTH) {
    throw new Error("Profile image is too large. Please use a smaller image.");
  }
}

function sanitizeAvatar(avatar?: string): string {
  if (!avatar) return DEFAULT_AVATAR;
  if (!avatar.startsWith(ALLOWED_AVATAR_PREFIX)) return DEFAULT_AVATAR;
  return avatar;
}

function sanitizeUser(user: User): User {
  return {
    ...user,
    avatar: sanitizeAvatar(user.avatar),
  };
}

async function sanitizeAndPersistUsers(users: User[]): Promise<User[]> {
  const normalized = users.map(sanitizeUser);
  const updates: Promise<unknown>[] = [];
  for (let i = 0; i < users.length; i++) {
    if (users[i].avatar !== normalized[i].avatar) {
      updates.push(db.update(COLLECTION, users[i].id, { avatar: normalized[i].avatar }));
    }
  }
  if (updates.length > 0) {
    await Promise.all(updates);
  }
  return normalized;
}

async function getUsers(forceRefresh = false): Promise<User[]> {
  if (!initialized || forceRefresh) {
    const dbUsers = await db.getCollection<User>(COLLECTION);
    if (dbUsers.length === 0 && !initialized && ENABLE_DEFAULT_SEEDING) {
      console.log("[Users] No users in DB, initializing with defaults");
      for (const user of initialUsers) {
        await db.create(COLLECTION, sanitizeUser(user));
      }
      usersCache = await sanitizeAndPersistUsers(initialUsers);
    } else if (dbUsers.length === 0 && !initialized) {
      console.log("[Users] Collection empty, seeding disabled");
      usersCache = [];
    } else {
      usersCache = await sanitizeAndPersistUsers(dbUsers);
    }
    initialized = true;
  }
  return usersCache;
}

export const usersRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const users = await getUsers(true);
    console.log("[Users] Fetching all users from DB, count:", users.length);
    return users.map(sanitizeUser);
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Users] Fetching user by id:", input.id);
      const users = await getUsers();
      const user = users.find((u) => u.id === input.id);
      if (!user) {
        throw new Error("User not found");
      }
      return sanitizeUser(user);
    }),

  getByEmail: publicProcedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      console.log("[Users] Fetching user by email:", input.email);
      const users = await getUsers();
      const user = users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
      return user ? sanitizeUser(user) : null;
    }),

  login: publicProcedure
    .input(z.object({ email: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[Users] Login attempt for:", input.email);
      const users = await getUsers();
      const user = users.find(
        (u) => u.email.toLowerCase() === input.email.toLowerCase() && u.password === input.password
      );
      if (!user) {
        throw new Error("Invalid credentials");
      }
      if (user.status === "pending") {
        throw new Error("Account pending activation");
      }
      console.log("[Users] Login successful for:", user.id);
      return sanitizeUser(user);
    }),

  activate: publicProcedure
    .input(z.object({ email: z.string(), inviteCode: z.string(), password: z.string() }))
    .mutation(async ({ input }) => {
      const normalizedEmail = input.email.trim().toLowerCase();
      const normalizedInviteCode = input.inviteCode.trim().toUpperCase();

      console.log("[Users] Activation attempt with email:", normalizedEmail, "code:", normalizedInviteCode);
      const users = await getUsers();
      
      // First, find user by email to give better error messages
      const userByEmail = users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
      
      if (!userByEmail) {
        console.log("[Users] Activation failed - email not found:", input.email);
        throw new Error("Account not found. Please contact admin for an invite.");
      }
      
      if (userByEmail.status === "active") {
        console.log("[Users] Activation failed - account already active:", input.email);
        throw new Error("Account already activated. Please use Sign In instead.");
      }
      
      if (userByEmail.status === "suspended") {
        console.log("[Users] Activation failed - account suspended:", input.email);
        throw new Error("Account is suspended. Please contact admin.");
      }
      
      // Verify invite code matches
      const expectedInviteCode = userByEmail.inviteCode?.trim().toUpperCase();
      if (expectedInviteCode !== normalizedInviteCode) {
        console.log("[Users] Activation failed - wrong invite code for:", normalizedEmail, "expected:", userByEmail.inviteCode, "got:", normalizedInviteCode);
        throw new Error("Incorrect invite code. Please check the code sent by your admin.");
      }
      
      const userIndex = users.findIndex((u) => u.id === userByEmail.id);
      const updatedUser: User = {
        ...userByEmail,
        status: "active",
        password: input.password,
        activatedAt: new Date().toISOString().split("T")[0],
      };
      
      await db.update(COLLECTION, userByEmail.id, updatedUser);
      usersCache[userIndex] = updatedUser;
      
      console.log("[Users] Activated user:", userByEmail.id, userByEmail.email);
      return sanitizeUser(updatedUser);
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string(),
        role: z.enum(["ambassador", "regional_lead", "admin"]),
        region: z.string(),
        fslEmail: z.string().optional(),
        handles: z.object({
          twitter: z.string().optional(),
          instagram: z.string().optional(),
          tiktok: z.string().optional(),
          youtube: z.string().optional(),
          discord: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const inviteCode = `FSL${Date.now().toString(36).toUpperCase()}`;
      const normalizedEmail = input.email.trim().toLowerCase();
      const users = await getUsers(true);
      const existing = users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);

      if (existing) {
        if (existing.status === "active") {
          throw new Error("A user with this email already exists and is active.");
        }
        if (existing.status === "suspended") {
          throw new Error("A suspended user with this email already exists.");
        }

        const refreshedInviteCode = `FSL${Date.now().toString(36).toUpperCase()}`;
        const refreshedUser: User = {
          ...existing,
          name: input.name,
          role: input.role as UserRole,
          region: input.region,
          fslEmail: input.fslEmail,
          handles: input.handles || existing.handles || {},
          inviteCode: refreshedInviteCode,
          status: "pending",
        };

        await db.update(COLLECTION, existing.id, refreshedUser);
        const existingIndex = usersCache.findIndex((u) => u.id === existing.id);
        if (existingIndex >= 0) {
          usersCache[existingIndex] = refreshedUser;
        } else {
          usersCache.push(refreshedUser);
        }

        console.log("[Users] Refreshed invite code for existing pending user:", existing.id, "invite code:", refreshedInviteCode);
        return sanitizeUser(refreshedUser);
      }

      const newUser: User = {
        id: `user-${Date.now()}`,
        name: input.name,
        avatar: sanitizeAvatar(DEFAULT_AVATAR),
        email: normalizedEmail,
        role: input.role as UserRole,
        region: input.region,
        fslEmail: input.fslEmail,
        points: 0,
        rank: 0,
        status: "pending" as UserStatus,
        inviteCode,
        handles: input.handles || {},
        stats: {
          totalPosts: 0,
          totalImpressions: 0,
          totalLikes: 0,
          totalRetweets: 0,
          completedTasks: 0,
        },
        joinedAt: new Date().toISOString().split("T")[0],
      };
      
      try {
        await db.create(COLLECTION, newUser);
        usersCache.push(newUser);
        console.log("[Users] Created new user:", newUser.id, "invite code:", inviteCode);
        return sanitizeUser(newUser);
      } catch (error) {
        console.log("[Users] Failed to create user in DB:", error);
        throw new Error("Failed to save user. Please try again.");
      }
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        avatar: z.string().optional(),
        role: z.enum(["ambassador", "regional_lead", "admin"]).optional(),
        region: z.string().optional(),
        status: z.enum(["pending", "active", "suspended"]).optional(),
        fslEmail: z.string().optional(),
        handles: z.object({
          twitter: z.string().optional(),
          instagram: z.string().optional(),
          tiktok: z.string().optional(),
          youtube: z.string().optional(),
          discord: z.string().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateAvatar(input.avatar);
      const users = await getUsers();
      const index = users.findIndex((u) => u.id === input.id);
      if (index === -1) {
        throw new Error("User not found");
      }
      
      const updatedUser = { ...users[index], ...input } as User;
      updatedUser.avatar = sanitizeAvatar(input.avatar ?? users[index].avatar);
      await db.update(COLLECTION, input.id, updatedUser);
      usersCache[index] = updatedUser;
      
      console.log("[Users] Updated user:", input.id);
      return sanitizeUser(updatedUser);
    }),

  updateStats: publicProcedure
    .input(
      z.object({
        id: z.string(),
        impressions: z.number().optional(),
        likes: z.number().optional(),
        retweets: z.number().optional(),
        posts: z.number().optional(),
        completedTasks: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const users = await getUsers();
      const index = users.findIndex((u) => u.id === input.id);
      if (index === -1) {
        throw new Error("User not found");
      }
      
      const user = users[index];
      const updatedStats = { ...user.stats };
      
      if (input.impressions !== undefined) {
        updatedStats.totalImpressions += input.impressions;
      }
      if (input.likes !== undefined) {
        updatedStats.totalLikes += input.likes;
      }
      if (input.retweets !== undefined) {
        updatedStats.totalRetweets += input.retweets;
      }
      if (input.posts !== undefined) {
        updatedStats.totalPosts += input.posts;
      }
      if (input.completedTasks !== undefined) {
        updatedStats.completedTasks += input.completedTasks;
      }
      
      const updatedUser = { ...user, stats: updatedStats };
      await db.update(COLLECTION, input.id, updatedUser);
      usersCache[index] = updatedUser;
      
      console.log("[Users] Updated stats for user:", input.id);
      return updatedUser;
    }),

  getLeaderboard: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit || 10;
      console.log("[Users] Fetching leaderboard, limit:", limit);
      const users = await getUsers();
      const sortedUsers = [...users]
        .filter((u) => u.role === "ambassador" && u.status === "active")
        .sort((a, b) => b.points - a.points)
        .slice(0, limit)
        .map((u, i) => ({
          rank: i + 1,
          name: u.name,
          region: u.region,
          points: u.points,
          posts: u.stats.totalPosts,
        }));
      return sortedUsers;
    }),

  changePassword: publicProcedure
    .input(z.object({ 
      id: z.string(), 
      currentPassword: z.string().optional(),
      newPassword: z.string().min(6, "Password must be at least 6 characters")
    }))
    .mutation(async ({ input }) => {
      const users = await getUsers();
      const index = users.findIndex((u) => u.id === input.id);
      if (index === -1) {
        throw new Error("User not found");
      }
      
      const user = users[index];
      
      // If currentPassword is provided, verify it (for self-service password change)
      if (input.currentPassword !== undefined && user.password !== input.currentPassword) {
        throw new Error("Current password is incorrect");
      }
      
      const newSessionVersion = (user.sessionVersion || 0) + 1;
      const updatedUser = { ...user, password: input.newPassword, sessionVersion: newSessionVersion };
      await db.update(COLLECTION, input.id, updatedUser);
      usersCache[index] = updatedUser;
      
      console.log("[Users] Password changed for user:", input.id, "new sessionVersion:", newSessionVersion);
      return { success: true, sessionVersion: newSessionVersion };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const users = await getUsers();
      const index = users.findIndex((u) => u.id === input.id);
      if (index === -1) {
        throw new Error("User not found");
      }
      
      await db.remove(COLLECTION, input.id);
      usersCache.splice(index, 1);
      
      console.log("[Users] Deleted user:", input.id);
      return { success: true };
    }),
});
