import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { db } from "@/backend/db";
import { ensureActiveSeason, isSubmissionInSeason } from "@/backend/services/season";
import {
  extractTweetId,
  extractTwitterAuthorHandle,
  normalizeTwitterHandle,
  normalizeTwitterUrl,
} from "@/backend/services/performance";
import type { ExtraContentSubmission, Submission, User } from "@/types";

const EXTRA_CONTENT_COLLECTION = "extra_content_submissions";
const SUBMISSIONS_COLLECTION = "submissions";
const USERS_COLLECTION = "users";
const DAY_MS = 24 * 60 * 60 * 1000;

async function getExtraContent(): Promise<ExtraContentSubmission[]> {
  return db.getCollection<ExtraContentSubmission>(EXTRA_CONTENT_COLLECTION);
}

async function ensureUserOwnsTweet(userId: string, authorHandle: string): Promise<void> {
  const user = await db.getById<User>(USERS_COLLECTION, userId);
  if (!user) throw new Error("User not found");

  const profileHandle = normalizeTwitterHandle(user.handles?.twitter);
  if (!profileHandle) {
    throw new Error("Add your X handle to your profile before submitting extra X content");
  }

  if (profileHandle !== authorHandle) {
    throw new Error("This post must come from your connected X account");
  }
}

async function ensureTweetIsGloballyUnique(tweetId: string): Promise<void> {
  const [extraContent, submissions] = await Promise.all([
    getExtraContent(),
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
  ]);

  if (extraContent.some((item) => item.tweetId === tweetId)) {
    throw new Error("This X post has already been submitted");
  }

  const duplicateTaskSubmission = submissions.some((submission) => {
    const urls = [
      submission.postUrl,
      ...(submission.links || []).map((link) => link.url),
    ].filter(Boolean);
    return urls.some((url) => extractTweetId(url) === tweetId);
  });

  if (duplicateTaskSubmission) {
    throw new Error("This X post is already attached to a task submission");
  }
}

function buildExtraContent(input: { userId: string; postUrl: string }, seasonId: string): ExtraContentSubmission {
  const canonicalUrl = normalizeTwitterUrl(input.postUrl);
  const tweetId = extractTweetId(canonicalUrl);
  if (!tweetId) {
    throw new Error("Enter a valid X post URL");
  }

  const authorHandle = extractTwitterAuthorHandle(canonicalUrl);
  if (!authorHandle) {
    throw new Error("Enter the original X post URL, including the account handle");
  }

  const now = Date.now();
  return {
    id: `extra-x-${now}`,
    seasonId,
    userId: input.userId,
    platform: "twitter",
    postUrl: input.postUrl.trim(),
    canonicalUrl,
    tweetId,
    authorHandle,
    status: "tracking",
    submittedAt: new Date(now).toISOString(),
    xTrackingExpiresAt: new Date(now + 7 * DAY_MS).toISOString(),
    metrics: {
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    },
  };
}

export const extraContentRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const currentSeason = await ensureActiveSeason();
    const extraContent = await getExtraContent();
    return extraContent.filter((item) => isSubmissionInSeason(item, currentSeason));
  }),

  getByUserId: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const currentSeason = await ensureActiveSeason();
      const extraContent = await getExtraContent();
      return extraContent
        .filter((item) => item.userId === input.userId && isSubmissionInSeason(item, currentSeason))
        .sort((a, b) => Date.parse(b.submittedAt || "") - Date.parse(a.submittedAt || ""));
    }),

  create: publicProcedure
    .input(z.object({ userId: z.string(), postUrl: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const currentSeason = await ensureActiveSeason();
      const next = buildExtraContent(input, currentSeason.id);

      await ensureUserOwnsTweet(input.userId, next.authorHandle);
      await ensureTweetIsGloballyUnique(next.tweetId);
      await db.create(EXTRA_CONTENT_COLLECTION, next);

      return next;
    }),
});
