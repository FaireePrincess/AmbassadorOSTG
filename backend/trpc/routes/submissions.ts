import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { submissions as initialSubmissions, ambassadorPosts as initialPosts } from "@/mocks/data";
import { db } from "@/backend/db";
import type { Submission, SubmissionStatus, Platform, AmbassadorPost, User } from "@/types";

const SUBMISSIONS_COLLECTION = "submissions";
const POSTS_COLLECTION = "ambassador_posts";
const MAX_IMAGE_DATA_URI_LENGTH = 300_000;
const ENABLE_DEFAULT_SEEDING = (process.env.ENABLE_DEFAULT_SEEDING || "false") === "true";

function validateScreenshot(screenshotUrl?: string) {
  if (!screenshotUrl) return;
  if (screenshotUrl.startsWith("data:image/") && screenshotUrl.length > MAX_IMAGE_DATA_URI_LENGTH) {
    throw new Error("Submission screenshot is too large. Please use a smaller image.");
  }
}

async function ensureSubmissionsInitialized(): Promise<void> {
  const dbSubmissions = await db.getCollection<Submission>(SUBMISSIONS_COLLECTION);
  if (dbSubmissions.length === 0 && ENABLE_DEFAULT_SEEDING) {
    console.log("[Submissions] No submissions in DB, initializing with defaults");
    for (const sub of initialSubmissions) {
      await db.create(SUBMISSIONS_COLLECTION, sub);
    }
  } else if (dbSubmissions.length === 0) {
    console.log("[Submissions] Collection empty, seeding disabled");
  }
}

async function ensurePostsInitialized(): Promise<void> {
  const dbPosts = await db.getCollection<AmbassadorPost>(POSTS_COLLECTION);
  if (dbPosts.length === 0 && ENABLE_DEFAULT_SEEDING) {
    console.log("[Submissions] No posts in DB, initializing with defaults");
    for (const post of initialPosts) {
      await db.create(POSTS_COLLECTION, post);
    }
  } else if (dbPosts.length === 0) {
    console.log("[Submissions] Posts collection empty, seeding disabled");
  }
}

let submissionsInitPromise: Promise<void> | null = null;
let postsInitPromise: Promise<void> | null = null;

async function getSubmissions(): Promise<Submission[]> {
  if (!submissionsInitPromise) {
    submissionsInitPromise = ensureSubmissionsInitialized();
  }
  await submissionsInitPromise;
  const submissions = await db.getCollection<Submission>(SUBMISSIONS_COLLECTION);
  console.log("[Submissions] Read from DB, count:", submissions.length);
  return submissions;
}

async function getPosts(): Promise<AmbassadorPost[]> {
  if (!postsInitPromise) {
    postsInitPromise = ensurePostsInitialized();
  }
  await postsInitPromise;
  const posts = await db.getCollection<AmbassadorPost>(POSTS_COLLECTION);
  console.log("[Posts] Read from DB, count:", posts.length);
  return posts;
}

async function getTaskInfo(taskId: string): Promise<{ title: string; campaignTitle: string }> {
  try {
    const tasks = await db.getCollection<{ id: string; title: string; campaignTitle: string }>("tasks");
    const task = tasks.find((t) => t.id === taskId);
    return {
      title: task?.title || "Unknown Task",
      campaignTitle: task?.campaignTitle || "Unknown Campaign",
    };
  } catch {
    return { title: "Unknown Task", campaignTitle: "Unknown Campaign" };
  }
}

async function getUserInfo(userId: string): Promise<User | null> {
  try {
    const users = await db.getCollection<User>("users");
    return users.find((u) => u.id === userId) || null;
  } catch {
    return null;
  }
}

const ratingSchema = z.object({
  relevanceToTask: z.number().min(0).max(25),
  creativity: z.number().min(0).max(15),
  originality: z.number().min(0).max(15),
  effortFormat: z.number().min(0).max(15),
  enthusiasmTone: z.number().min(0).max(10),
  engagementScore: z.number().min(0).max(20),
  totalScore: z.number().min(0).max(100),
  notes: z.string().optional(),
});

export const submissionsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const submissions = await getSubmissions();
    console.log("[Submissions] Fetching all submissions, count:", submissions.length);
    return submissions;
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Submissions] Fetching submission by id:", input.id);
      const submissions = await getSubmissions();
      const submission = submissions.find((s) => s.id === input.id);
      if (!submission) {
        throw new Error("Submission not found");
      }
      return submission;
    }),

  getByUserId: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      console.log("[Submissions] Fetching submissions for user:", input.userId);
      const submissions = await getSubmissions();
      return submissions.filter((s) => s.userId === input.userId);
    }),

  getByTaskId: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      console.log("[Submissions] Fetching submissions for task:", input.taskId);
      const submissions = await getSubmissions();
      return submissions.filter((s) => s.taskId === input.taskId);
    }),

  create: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        taskId: z.string(),
        platform: z.enum(["twitter", "instagram", "tiktok", "youtube"]),
        postUrl: z.string(),
        screenshotUrl: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateScreenshot(input.screenshotUrl);
      const taskInfo = await getTaskInfo(input.taskId);
      const newSubmission: Submission = {
        id: `sub-${Date.now()}`,
        userId: input.userId,
        taskId: input.taskId,
        taskTitle: taskInfo.title,
        campaignTitle: taskInfo.campaignTitle,
        platform: input.platform as Platform,
        postUrl: input.postUrl,
        screenshotUrl: input.screenshotUrl,
        notes: input.notes,
        status: "pending" as SubmissionStatus,
        submittedAt: new Date().toISOString(),
      };
      
      await db.create(SUBMISSIONS_COLLECTION, newSubmission);

      const task = await db.getById<{ id: string; submissions: number }>("tasks", input.taskId);
      if (task) {
        await db.update<{ id: string; submissions: number }>("tasks", input.taskId, {
          submissions: (task.submissions || 0) + 1,
        });
      }
      
      console.log("[Submissions] Created new submission:", newSubmission.id);
      return newSubmission;
    }),

  review: publicProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["approved", "needs_edits", "rejected"]),
        feedback: z.string().optional(),
        rating: ratingSchema.optional(),
        metrics: z.object({
          impressions: z.number(),
          likes: z.number(),
          comments: z.number(),
          shares: z.number(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const submissions = await getSubmissions();
      const submission = submissions.find((s) => s.id === input.id);
      if (!submission) {
        throw new Error("Submission not found");
      }
      
      const updatedSubmission: Submission = {
        ...submission,
        status: input.status as SubmissionStatus,
        feedback: input.feedback,
        reviewedAt: new Date().toISOString(),
        rating: input.rating || submission.rating,
        metrics: input.metrics || submission.metrics,
      };
      
      await db.update(SUBMISSIONS_COLLECTION, input.id, updatedSubmission);

      const wasApproved = submission.status === "approved";
      const isNowApproved = input.status === "approved";
      if (!wasApproved && isNowApproved) {
        const user = await getUserInfo(submission.userId);
        if (user) {
          const approvedMetrics = input.metrics || submission.metrics || {
            impressions: 0,
            likes: 0,
            comments: 0,
            shares: 0,
          };
          const approvedScore = input.rating?.totalScore || 0;

          await db.update<User>("users", user.id, {
            points: user.points + approvedScore,
            stats: {
              ...user.stats,
              totalPosts: user.stats.totalPosts + 1,
              totalImpressions: user.stats.totalImpressions + approvedMetrics.impressions,
              totalLikes: user.stats.totalLikes + approvedMetrics.likes,
              totalRetweets: user.stats.totalRetweets + approvedMetrics.shares,
              completedTasks: user.stats.completedTasks + 1,
            },
          });

          const newPost: AmbassadorPost = {
            id: `post-${Date.now()}`,
            userId: submission.userId,
            userName: user.name,
            userAvatar: user.avatar,
            userRegion: user.region,
            platform: submission.platform,
            campaignTitle: submission.campaignTitle,
            content: submission.notes || `Post for ${submission.taskTitle}`,
            postUrl: submission.postUrl,
            thumbnail: submission.screenshotUrl,
            metrics: approvedMetrics,
            postedAt: submission.submittedAt,
          };
          
          await db.create(POSTS_COLLECTION, newPost);
          
          console.log("[Submissions] Added to ambassador feed:", newPost.id);
        }
      }

      console.log("[Submissions] Reviewed submission:", input.id, "status:", input.status);
      return updatedSubmission;
    }),

  getAmbassadorFeed: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit || 20;
      console.log("[Submissions] Fetching ambassador feed, limit:", limit);
      const posts = await getPosts();
      return posts.slice(0, limit);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const submissions = await getSubmissions();
      const existing = submissions.find((s) => s.id === input.id);
      if (!existing) {
        throw new Error("Submission not found");
      }
      
      await db.remove(SUBMISSIONS_COLLECTION, input.id);
      
      console.log("[Submissions] Deleted submission:", input.id);
      return { success: true };
    }),
});
