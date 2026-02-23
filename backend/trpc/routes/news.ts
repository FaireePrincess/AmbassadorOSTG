import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import * as db from "../../db";
import type { User } from "@/types";

const USERS_COLLECTION = "users";
const NEWS_COLLECTION = "home_news";
const NEWS_ID = "latest";

type HomeNews = {
  id: string;
  postUrl: string;
  text?: string;
  imageUrl?: string;
  updatedAt: string;
  updatedByUserId: string;
};

async function ensureAdmin(adminUserId: string) {
  const user = await db.getById<User>(USERS_COLLECTION, adminUserId);
  if (!user || user.role !== "admin" || user.status !== "active") {
    throw new Error("Only an active admin can update home news.");
  }
}

export const newsRouter = createTRPCRouter({
  getCurrent: publicProcedure.query(async () => {
    const item = await db.getById<HomeNews>(NEWS_COLLECTION, NEWS_ID);
    if (!item) return null;
    return item;
  }),

  upsert: publicProcedure
    .input(
      z.object({
        adminUserId: z.string(),
        postUrl: z.string().trim().min(1),
        text: z.string().trim().optional(),
        imageUrl: z.string().trim().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await ensureAdmin(input.adminUserId);

      const now = new Date().toISOString();
      const payload: HomeNews = {
        id: NEWS_ID,
        postUrl: input.postUrl,
        text: input.text || "",
        imageUrl: input.imageUrl || "",
        updatedAt: now,
        updatedByUserId: input.adminUserId,
      };

      return db.upsert<HomeNews>(NEWS_COLLECTION, payload);
    }),
});
