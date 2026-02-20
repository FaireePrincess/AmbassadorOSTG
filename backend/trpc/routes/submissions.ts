import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { submissions as initialSubmissions, ambassadorPosts as initialPosts } from "@/mocks/data";
import { db } from "@/backend/db";
import type { Submission, SubmissionStatus, Platform, AmbassadorPost, User, Task } from "@/types";
import {
  computeEngagementScore,
  computeXEngagementScoreFromImpressions,
  isValidPlatformUrl,
  normalizePlatform,
  normalizeTwitterUrl,
  parseMultiLinks,
  recomputeAllUserPerformance,
  extractTweetId,
} from "@/backend/services/performance";

const SUBMISSIONS_COLLECTION = "submissions";
const POSTS_COLLECTION = "ambassador_posts";
const MAX_IMAGE_DATA_URI_LENGTH = 300_000;
const DEFAULT_AVATAR = "https://api.dicebear.com/9.x/fun-emoji/png?seed=Bear&backgroundColor=c0aede";
const ALLOWED_AVATAR_PREFIX = "https://api.dicebear.com/9.x/fun-emoji/png";
const ENABLE_DEFAULT_SEEDING = false;
const LEGACY_MOCK_POST_IDS = new Set(initialPosts.map((post) => post.id));

function validateScreenshot(screenshotUrl?: string) {
  if (!screenshotUrl) return;
  if (screenshotUrl.startsWith("data:image/") && screenshotUrl.length > MAX_IMAGE_DATA_URI_LENGTH) {
    throw new Error("Submission screenshot is too large. Please use a smaller image.");
  }
}

function sanitizeAvatar(avatar?: string): string {
  if (!avatar) return DEFAULT_AVATAR;
  if (!avatar.startsWith(ALLOWED_AVATAR_PREFIX)) return DEFAULT_AVATAR;
  return avatar;
}

function ensurePlatformLinkPairing(links: Array<{ platform: Platform; url: string }>) {
  if (links.length === 0) {
    throw new Error("At least one platform/link is required");
  }
  for (const entry of links) {
    if (!entry.url?.trim()) {
      throw new Error(`Missing URL for platform ${entry.platform}`);
    }
    if (!isValidPlatformUrl(entry.platform, entry.url)) {
      throw new Error(`Invalid URL for platform ${entry.platform}`);
    }
  }
}

function normalizeSubmissionLinks(input: {
  platform?: string;
  postUrl?: string;
  platforms?: string[];
  links?: Array<{ platform: string; url: string }>;
}) {
  const primaryPlatform = normalizePlatform(input.platform || input.platforms?.[0] || "twitter");
  const normalizedPlatforms = input.platforms?.map((platform) => normalizePlatform(platform)) || undefined;
  const normalizedLinks = input.links?.map((entry) => ({
    platform: normalizePlatform(entry.platform),
    url: entry.url,
  }));
  const links = parseMultiLinks(
    primaryPlatform,
    input.postUrl || "",
    normalizedPlatforms,
    normalizedLinks
  );
  ensurePlatformLinkPairing(links);

  const primaryLink = links.find((item) => normalizePlatform(item.platform) === primaryPlatform) || links[0];

  return {
    platform: normalizePlatform(primaryLink.platform),
    postUrl: primaryLink.url,
    platforms: [...new Set(links.map((item) => normalizePlatform(item.platform)))],
    links,
  };
}

async function ensureSubmissionsInitialized(): Promise<void> {
  const dbSubmissions = await db.getCollection<Submission>(SUBMISSIONS_COLLECTION);
  if (dbSubmissions.length === 0 && ENABLE_DEFAULT_SEEDING) {
    for (const sub of initialSubmissions) {
      await db.create(SUBMISSIONS_COLLECTION, sub);
    }
  }
}

async function ensurePostsInitialized(): Promise<void> {
  const dbPosts = await db.getCollection<AmbassadorPost>(POSTS_COLLECTION);
  if (dbPosts.length === 0 && ENABLE_DEFAULT_SEEDING) {
    for (const post of initialPosts) {
      await db.create(POSTS_COLLECTION, post);
    }
  }
}

let submissionsInitPromise: Promise<void> | null = null;
let postsInitPromise: Promise<void> | null = null;

async function getSubmissions(): Promise<Submission[]> {
  if (!submissionsInitPromise) {
    submissionsInitPromise = ensureSubmissionsInitialized();
  }
  await submissionsInitPromise;
  return db.getCollection<Submission>(SUBMISSIONS_COLLECTION);
}

async function getPosts(): Promise<AmbassadorPost[]> {
  if (!postsInitPromise) {
    postsInitPromise = ensurePostsInitialized();
  }
  await postsInitPromise;
  const posts = await db.getCollection<AmbassadorPost>(POSTS_COLLECTION);

  const legacyMockPosts = posts.filter((post) => LEGACY_MOCK_POST_IDS.has(post.id));
  if (legacyMockPosts.length > 0) {
    await Promise.all(legacyMockPosts.map((post) => db.remove(POSTS_COLLECTION, post.id)));
  }

  return legacyMockPosts.length > 0 ? posts.filter((post) => !LEGACY_MOCK_POST_IDS.has(post.id)) : posts;
}

async function getTaskInfo(taskId: string): Promise<{ title: string; campaignTitle: string; requiredReferenceTweetUrl?: string }> {
  try {
    const tasks = await db.getCollection<Task>("tasks");
    const task = tasks.find((t) => t.id === taskId);
    return {
      title: task?.title || "Unknown Task",
      campaignTitle: task?.campaignTitle || "Unknown Campaign",
      requiredReferenceTweetUrl: task?.requiredReferenceTweetUrl,
    };
  } catch {
    return { title: "Unknown Task", campaignTitle: "Unknown Campaign" };
  }
}

async function getUserInfo(userId: string): Promise<User | null> {
  const users = await db.getCollection<User>("users");
  return users.find((u) => u.id === userId) || null;
}

function validateTaskReferenceTweet(
  requiredReferenceTweetUrl: string | undefined,
  links: Array<{ platform: Platform; url: string }>
) {
  if (!requiredReferenceTweetUrl) return;

  const requiredNormalized = normalizeTwitterUrl(requiredReferenceTweetUrl);
  const hasMatch = links.some((item) => {
    if (normalizePlatform(item.platform) !== "twitter") return false;
    return normalizeTwitterUrl(item.url) === requiredNormalized;
  });

  if (!hasMatch) {
    throw new Error("This task requires the specified reference tweet URL in your submission");
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

const linkSchema = z.object({
  platform: z.enum(["twitter", "x", "instagram", "tiktok", "youtube", "facebook", "telegram"]),
  url: z.string().min(1),
});

export const submissionsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    return getSubmissions();
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const submissions = await getSubmissions();
      const submission = submissions.find((s) => s.id === input.id);
      if (!submission) throw new Error("Submission not found");
      return submission;
    }),

  getByUserId: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const submissions = await getSubmissions();
      return submissions.filter((s) => s.userId === input.userId);
    }),

  getByTaskId: publicProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input }) => {
      const submissions = await getSubmissions();
      return submissions.filter((s) => s.taskId === input.taskId);
    }),

  create: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        taskId: z.string(),
        platform: z.enum(["twitter", "x", "instagram", "tiktok", "youtube", "facebook", "telegram"]).optional(),
        postUrl: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "x", "instagram", "tiktok", "youtube", "facebook", "telegram"])).optional(),
        links: z.array(linkSchema).optional(),
        screenshotUrl: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateScreenshot(input.screenshotUrl);
      const taskInfo = await getTaskInfo(input.taskId);
      const linkData = normalizeSubmissionLinks(input);
      validateTaskReferenceTweet(taskInfo.requiredReferenceTweetUrl, linkData.links);

      const newSubmission: Submission = {
        id: `sub-${Date.now()}`,
        userId: input.userId,
        taskId: input.taskId,
        taskTitle: taskInfo.title,
        campaignTitle: taskInfo.campaignTitle,
        platform: linkData.platform,
        platforms: linkData.platforms,
        postUrl: linkData.postUrl,
        links: linkData.links,
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

      return newSubmission;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        userId: z.string(),
        platform: z.enum(["twitter", "x", "instagram", "tiktok", "youtube", "facebook", "telegram"]).optional(),
        postUrl: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "x", "instagram", "tiktok", "youtube", "facebook", "telegram"])).optional(),
        links: z.array(linkSchema).optional(),
        screenshotUrl: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateScreenshot(input.screenshotUrl);
      const submissions = await getSubmissions();
      const existing = submissions.find((submission) => submission.id === input.id);
      if (!existing) throw new Error("Submission not found");
      if (existing.userId !== input.userId) throw new Error("You can only edit your own submission");
      if (existing.status !== "pending" && existing.status !== "needs_edits") {
        throw new Error("Approved or rejected submissions cannot be edited");
      }

      const taskInfo = await getTaskInfo(existing.taskId);
      const linkData = normalizeSubmissionLinks({
        platform: input.platform || existing.platform,
        postUrl: input.postUrl || existing.postUrl,
        platforms: input.platforms || existing.platforms,
        links: input.links || existing.links,
      });
      validateTaskReferenceTweet(taskInfo.requiredReferenceTweetUrl, linkData.links);

      const updatedSubmission: Submission = {
        ...existing,
        platform: linkData.platform,
        platforms: linkData.platforms,
        postUrl: linkData.postUrl,
        links: linkData.links,
        screenshotUrl: input.screenshotUrl,
        notes: input.notes,
        status: "pending",
        feedback: undefined,
        rating: undefined,
        reviewedAt: undefined,
        submittedAt: new Date().toISOString(),
      };

      await db.update<Submission>(SUBMISSIONS_COLLECTION, input.id, updatedSubmission);
      return updatedSubmission;
    }),

  review: publicProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["approved", "needs_edits", "rejected"]),
        feedback: z.string().optional(),
        rating: ratingSchema.optional(),
        metrics: z
          .object({
            impressions: z.number(),
            likes: z.number(),
            comments: z.number(),
            shares: z.number(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const submissions = await getSubmissions();
      const submission = submissions.find((s) => s.id === input.id);
      if (!submission) throw new Error("Submission not found");

      const nowIso = new Date().toISOString();
      const wasApproved = submission.status === "approved";
      const isNowApproved = input.status === "approved";
      const nextMetrics = input.metrics || submission.metrics || {
        impressions: 0,
        likes: 0,
        comments: 0,
        shares: 0,
      };

      let nextRating = input.rating || submission.rating;
      if (isNowApproved && nextRating) {
        const links = parseMultiLinks(
          normalizePlatform(submission.platform),
          submission.postUrl,
          submission.platforms,
          submission.links
        );
        const hasTwitterLink = links.some((item) => normalizePlatform(item.platform) === "twitter");
        const xImpressions = input.metrics?.impressions ?? submission.xImpressions;

        if (hasTwitterLink && typeof xImpressions === "number") {
          const currentEngagement = Math.max(0, Math.min(20, Math.trunc(nextRating.engagementScore || 0)));
          const thresholdScore = computeXEngagementScoreFromImpressions(xImpressions);
          const nextEngagement = Math.max(currentEngagement, thresholdScore);
          const contentOnly = Math.max(0, (nextRating.totalScore || 0) - currentEngagement);
          nextRating = {
            ...nextRating,
            engagementScore: nextEngagement,
            totalScore: Math.min(100, Number((contentOnly + nextEngagement).toFixed(2))),
          };
        } else if (!hasTwitterLink) {
          const engagementScore = computeEngagementScore({ ...submission, metrics: nextMetrics });
          const contentOnly = Math.max(0, (nextRating.totalScore || 0) - (nextRating.engagementScore || 0));
          nextRating = {
            ...nextRating,
            engagementScore,
            totalScore: Math.min(100, Number((contentOnly + engagementScore).toFixed(2))),
          };
        }
      }

      let xTrackingExpiresAt = submission.xTrackingExpiresAt;
      const links = parseMultiLinks(
        normalizePlatform(submission.platform),
        submission.postUrl,
        submission.platforms,
        submission.links
      );

      const twitterLink = links.find((item) => normalizePlatform(item.platform) === "twitter");
      const hasTrackableTweet = !!twitterLink?.url && !!extractTweetId(twitterLink.url);
      if (isNowApproved && hasTrackableTweet) {
        xTrackingExpiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
      }

      const updatedSubmission: Submission = {
        ...submission,
        status: input.status as SubmissionStatus,
        feedback: input.feedback,
        reviewedAt: nowIso,
        rating: nextRating,
        metrics: nextMetrics,
        xTrackingExpiresAt,
      };

      await db.update(SUBMISSIONS_COLLECTION, input.id, updatedSubmission);

      const user = await getUserInfo(submission.userId);
      if (user && !wasApproved && isNowApproved) {
        const posts = await getPosts();
        const hasExistingPost = posts.some((post) => {
          const sourceSubmissionId = (post as AmbassadorPost & { sourceSubmissionId?: string }).sourceSubmissionId;
          return sourceSubmissionId === submission.id;
        });

        if (!hasExistingPost) {
          const newPost: AmbassadorPost & { sourceSubmissionId?: string } = {
            id: `post-${Date.now()}`,
            sourceSubmissionId: submission.id,
            userId: submission.userId,
            userName: user.name,
            userAvatar: sanitizeAvatar(user.avatar),
            userRegion: user.region,
            platform: updatedSubmission.platform,
            campaignTitle: submission.campaignTitle,
            content: submission.notes || `Post for ${submission.taskTitle}`,
            postUrl: updatedSubmission.postUrl,
            thumbnail: updatedSubmission.screenshotUrl,
            metrics: nextMetrics,
            postedAt: updatedSubmission.submittedAt,
          };
          await db.create(POSTS_COLLECTION, newPost);
        }
      }

      await recomputeAllUserPerformance();
      return updatedSubmission;
    }),

  getAmbassadorFeed: publicProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const limit = input?.limit || 20;
      const posts = await getPosts();
      return [...posts]
        .sort((a, b) => {
          const aTs = Date.parse(a.postedAt || "");
          const bTs = Date.parse(b.postedAt || "");
          return (Number.isNaN(bTs) ? 0 : bTs) - (Number.isNaN(aTs) ? 0 : aTs);
        })
        .slice(0, limit)
        .map((post) => ({
          ...post,
          userAvatar: sanitizeAvatar(post.userAvatar),
        }));
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const submissions = await getSubmissions();
      const existing = submissions.find((s) => s.id === input.id);
      if (!existing) throw new Error("Submission not found");

      await db.remove(SUBMISSIONS_COLLECTION, input.id);
      await recomputeAllUserPerformance();
      return { success: true };
    }),
});
