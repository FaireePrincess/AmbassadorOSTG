import { db } from "@/backend/db";
import type { Submission, User } from "@/types";
import {
  computeXEngagementScoreFromImpressions,
  detectAnomaly,
  extractTweetId,
  isWithinTrackingWindow,
  normalizePlatform,
  parseMultiLinks,
  recomputeAllUserPerformance,
} from "@/backend/services/performance";

const SUBMISSIONS_COLLECTION = "submissions";
const USERS_COLLECTION = "users";
const MAX_BATCH = 10;
const REQUEST_SPACING_MS = 3500;
const RATE_LIMIT_BACKOFF_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOURLY_MS = 60 * 60 * 1000;
const LOG_RETENTION_MS = 48 * 60 * 60 * 1000;

type XMetricsLogEntry = {
  id: string;
  timestamp: string;
  region: string;
  submissionId: string;
  userId: string;
  userName: string;
  postUrl: string;
  type: "updated" | "error";
  message: string;
  critical: boolean;
};

type XMetricsStatus = {
  configured: boolean;
  running: boolean;
  lastRunAt?: string;
  lastReason?: string;
  lastRegion?: string;
  lastProcessed: number;
  lastErrors: number;
  lastRemaining: number;
  lastDurationMs?: number;
  nextScheduledRunAt?: string;
  rateLimitedUntil?: string;
  regionLastRunAt: Record<string, string>;
  regions: string[];
  logs: XMetricsLogEntry[];
};

function getTwitterToken(): string | null {
  return process.env.TWITTER_BEARER_TOKEN || null;
}

type TweetMetrics = {
  impressions: number;
  likes: number;
  retweets: number;
  replies: number;
};

type UserMetrics = {
  followers: number;
};

async function fetchTweetMetrics(tweetId: string): Promise<TweetMetrics> {
  const token = getTwitterToken();
  if (!token) throw new Error("TWITTER_BEARER_TOKEN is not configured");

  const response = await fetch(
    `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    data?: { public_metrics?: { impression_count?: number; like_count?: number; retweet_count?: number; reply_count?: number } };
  };

  const metrics = payload.data?.public_metrics;
  return {
    impressions: metrics?.impression_count || 0,
    likes: metrics?.like_count || 0,
    retweets: metrics?.retweet_count || 0,
    replies: metrics?.reply_count || 0,
  };
}

function normalizeTwitterHandle(handle?: string): string | null {
  if (!handle) return null;
  const trimmed = handle.trim();
  if (!trimmed) return null;

  const withoutAt = trimmed.replace(/^@+/, "");
  const fromUrl = withoutAt.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/i);
  if (fromUrl?.[1]) return fromUrl[1];

  const direct = withoutAt.match(/^([A-Za-z0-9_]{1,15})$/);
  return direct?.[1] || null;
}

async function fetchUserMetricsByHandle(handle: string): Promise<UserMetrics> {
  const token = getTwitterToken();
  if (!token) throw new Error("TWITTER_BEARER_TOKEN is not configured");

  const response = await fetch(
    `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X user API error ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    data?: { public_metrics?: { followers_count?: number } };
  };

  return {
    followers: payload.data?.public_metrics?.followers_count || 0,
  };
}

function getTrackingExpiry(submission: Submission): string | null {
  if (submission.xTrackingExpiresAt) return submission.xTrackingExpiresAt;
  const approvedAt = submission.reviewedAt || submission.submittedAt;
  const baseTs = Date.parse(approvedAt || "");
  if (Number.isNaN(baseTs)) return null;
  return new Date(baseTs + 7 * DAY_MS).toISOString();
}

function getSubmissionTwitterUrl(submission: Submission): string | null {
  const links = parseMultiLinks(
    normalizePlatform(submission.platform),
    submission.postUrl,
    submission.platforms,
    submission.links
  );

  const twitterLink = links.find((item) => normalizePlatform(item.platform) === "twitter");
  return twitterLink?.url || null;
}

function canTrackSubmission(submission: Submission): boolean {
  if (submission.status !== "approved") return false;
  const twitterUrl = getSubmissionTwitterUrl(submission);
  if (!twitterUrl) return false;
  if (!extractTweetId(twitterUrl)) return false;

  const expiry = getTrackingExpiry(submission);
  if (!expiry) return false;
  return isWithinTrackingWindow(expiry);
}

function isCriticalError(message: string): boolean {
  return (
    message.includes("TWITTER_BEARER_TOKEN") ||
    message.includes("401") ||
    message.includes("403")
  );
}

let runInProgress = false;
let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
let regionQueueTimers: Array<ReturnType<typeof setTimeout>> = [];
let queuedRegionRuns: Array<{ region: string; runAt: number }> = [];
let nextCycleAt = 0;
let regionCursor = 0;
let rateLimitedUntil = 0;

let xMetricsStatus: XMetricsStatus = {
  configured: !!getTwitterToken(),
  running: false,
  lastProcessed: 0,
  lastErrors: 0,
  lastRemaining: 0,
  regionLastRunAt: {},
  regions: [],
  logs: [],
};

type RunOptions = {
  ignoreRateLimit?: boolean;
  maxBatch?: number;
  force?: boolean;
};

function pruneLogs() {
  const cutoff = Date.now() - LOG_RETENTION_MS;
  xMetricsStatus.logs = xMetricsStatus.logs.filter((entry) => {
    if (entry.critical) return true;
    const ts = Date.parse(entry.timestamp);
    if (Number.isNaN(ts)) return false;
    return ts >= cutoff;
  });
}

function pushLog(entry: XMetricsLogEntry) {
  xMetricsStatus.logs.unshift(entry);
  if (xMetricsStatus.logs.length > 1000) {
    xMetricsStatus.logs = xMetricsStatus.logs.slice(0, 1000);
  }
  pruneLogs();
}

function clearRegionQueue() {
  for (const timer of regionQueueTimers) {
    clearTimeout(timer);
  }
  regionQueueTimers = [];
  queuedRegionRuns = [];
}

function updateNextScheduledRunAt() {
  const now = Date.now();
  if (rateLimitedUntil > now) {
    xMetricsStatus.nextScheduledRunAt = new Date(rateLimitedUntil).toISOString();
    return;
  }

  const pendingRuns = queuedRegionRuns
    .map((run) => run.runAt)
    .filter((runAt) => runAt > now)
    .sort((a, b) => a - b);
  if (pendingRuns.length > 0) {
    xMetricsStatus.nextScheduledRunAt = new Date(pendingRuns[0]).toISOString();
    return;
  }

  if (nextCycleAt > now) {
    xMetricsStatus.nextScheduledRunAt = new Date(nextCycleAt).toISOString();
    return;
  }

  xMetricsStatus.nextScheduledRunAt = undefined;
}

function getRegions(users: User[]): string[] {
  return [...new Set(
    users
      .filter((u) => u.status === "active" && u.role !== "admin")
      .map((u) => u.region)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function pickNextRegion(regions: string[]): string | null {
  if (regions.length === 0) return null;

  for (let i = 0; i < regions.length; i++) {
    const idx = (regionCursor + i) % regions.length;
    const region = regions[idx];
    const last = xMetricsStatus.regionLastRunAt[region];
    const lastTs = last ? Date.parse(last) : 0;
    const due = !last || Number.isNaN(lastTs) || (Date.now() - lastTs >= DAY_MS);
    if (due) {
      regionCursor = (idx + 1) % regions.length;
      return region;
    }
  }

  return null;
}

function hasRegionRunWithinDay(region: string): boolean {
  const last = xMetricsStatus.regionLastRunAt[region];
  if (!last) return false;
  const lastTs = Date.parse(last);
  if (Number.isNaN(lastTs)) return false;
  return Date.now() - lastTs < DAY_MS;
}

async function getRegionAverageImpressionsMap(users: User[], submissions: Submission[]): Promise<Map<string, number>> {
  const regionByUserId = new Map(users.map((u) => [u.id, u.region]));
  const grouped = new Map<string, { total: number; count: number }>();

  for (const submission of submissions) {
    if (submission.status !== "approved") continue;
    const region = regionByUserId.get(submission.userId) || "Unknown";
    const entry = grouped.get(region) || { total: 0, count: 0 };
    entry.total += submission.metrics?.impressions || 0;
    entry.count += 1;
    grouped.set(region, entry);
  }

  return new Map(
    [...grouped.entries()].map(([region, value]) => [region, value.count > 0 ? value.total / value.count : 0])
  );
}

export async function runXMetricsTrackingBatch(
  reason = "scheduled",
  regionOverride?: string,
  options?: RunOptions
): Promise<{ processed: number; remaining: number; errors: number; region?: string }> {
  if (runInProgress) {
    return { processed: 0, remaining: 0, errors: 0, region: regionOverride };
  }
  const bypassRateLimit = options?.ignoreRateLimit === true;
  if (!bypassRateLimit && Date.now() < rateLimitedUntil) {
    return { processed: 0, remaining: 0, errors: 0, region: regionOverride };
  }
  if (Date.now() >= rateLimitedUntil) {
    rateLimitedUntil = 0;
    xMetricsStatus.rateLimitedUntil = undefined;
  }

  runInProgress = true;
  xMetricsStatus.running = true;
  xMetricsStatus.lastReason = reason;
  const startedAt = Date.now();

  let processed = 0;
  let errors = 0;
  let remaining = 0;
  let targetRegion = regionOverride;
  let hitRateLimit = false;

  try {
    const token = getTwitterToken();
    xMetricsStatus.configured = !!token;
    if (!token) {
      xMetricsStatus.lastRunAt = new Date().toISOString();
      xMetricsStatus.lastProcessed = 0;
      xMetricsStatus.lastErrors = 0;
      xMetricsStatus.lastRemaining = 0;
      xMetricsStatus.lastDurationMs = Date.now() - startedAt;
      pushLog({
        id: `xlog-${Date.now()}-config`,
        timestamp: new Date().toISOString(),
        region: targetRegion || "N/A",
        submissionId: "N/A",
        userId: "N/A",
        userName: "N/A",
        postUrl: "N/A",
        type: "error",
        message: "TWITTER_BEARER_TOKEN is not configured",
        critical: true,
      });
      return { processed: 0, remaining: 0, errors: 0, region: targetRegion };
    }

    const [submissions, users] = await Promise.all([
      db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
      db.getCollection<User>(USERS_COLLECTION),
    ]);

    const regions = getRegions(users);
    xMetricsStatus.regions = regions;

    if (!targetRegion) {
      targetRegion = pickNextRegion(regions) || undefined;
    }

    if (!targetRegion) {
      xMetricsStatus.lastRunAt = new Date().toISOString();
      xMetricsStatus.lastRegion = undefined;
      xMetricsStatus.lastProcessed = 0;
      xMetricsStatus.lastErrors = 0;
      xMetricsStatus.lastRemaining = 0;
      xMetricsStatus.lastDurationMs = Date.now() - startedAt;
      return { processed: 0, remaining: 0, errors: 0 };
    }

    if (!options?.force && hasRegionRunWithinDay(targetRegion)) {
      xMetricsStatus.lastRunAt = new Date().toISOString();
      xMetricsStatus.lastRegion = targetRegion;
      xMetricsStatus.lastReason = `${reason}-skipped-not-due`;
      xMetricsStatus.lastProcessed = 0;
      xMetricsStatus.lastErrors = 0;
      xMetricsStatus.lastRemaining = 0;
      xMetricsStatus.lastDurationMs = Date.now() - startedAt;
      return { processed: 0, remaining: 0, errors: 0, region: targetRegion };
    }

    const regionByUserId = new Map(users.map((u) => [u.id, u.region]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const followerCache = new Map<string, number>();
    const regionEligible = submissions.filter(
      (submission) => canTrackSubmission(submission) && (regionByUserId.get(submission.userId) || "Unknown") === targetRegion
    );

    const batchLimit = Math.max(1, Math.min(MAX_BATCH, options?.maxBatch ?? MAX_BATCH));
    const queue = regionEligible.slice(0, batchLimit);
    remaining = Math.max(0, regionEligible.length - queue.length);

    const regionAvgMap = await getRegionAverageImpressionsMap(users, submissions);

    for (const submission of queue) {
      const twitterUrl = getSubmissionTwitterUrl(submission);
      const tweetId = twitterUrl ? extractTweetId(twitterUrl) : null;
      if (!twitterUrl || !tweetId) continue;

      const user = userById.get(submission.userId);
      const userName = user?.name || "Unknown User";

      try {
        const prevMetrics = submission.metrics;
        const xMetrics = await fetchTweetMetrics(tweetId);
        const expiry = getTrackingExpiry(submission);
        if (!expiry) continue;
        const handle = normalizeTwitterHandle(user?.handles?.twitter);
        const followerCacheKey = handle || `user:${submission.userId}`;
        let followerCount = followerCache.get(followerCacheKey) || 0;

        if (handle && !followerCache.has(followerCacheKey)) {
          try {
            const userMetrics = await fetchUserMetricsByHandle(handle);
            followerCount = userMetrics.followers;
          } catch {
            followerCount = 0;
          }
          followerCache.set(followerCacheKey, followerCount);
        }

        const nextMetrics = {
          impressions: xMetrics.impressions,
          likes: xMetrics.likes,
          comments: xMetrics.replies,
          shares: xMetrics.retweets,
        };

        const updatedSubmission: Partial<Submission> = {
          metrics: nextMetrics,
          xImpressions: xMetrics.impressions,
          xLikes: xMetrics.likes,
          xReplies: xMetrics.replies,
          xReposts: xMetrics.retweets,
          xLastFetchedAt: new Date().toISOString(),
          xTrackingExpiresAt: expiry,
        };

        if (submission.rating && typeof xMetrics.impressions === "number") {
          const currentEngagement = Math.max(0, Math.min(20, Math.trunc(submission.rating.engagementScore || 0)));
          const thresholdScore = computeXEngagementScoreFromImpressions(xMetrics.impressions, followerCount);
          const nextEngagement = Math.max(currentEngagement, thresholdScore);

          // Do not rewrite scores unless threshold has actually increased.
          if (nextEngagement !== currentEngagement) {
            const contentOnly = Math.max(0, (submission.rating.totalScore || 0) - currentEngagement);
            updatedSubmission.rating = {
              ...submission.rating,
              engagementScore: nextEngagement,
              totalScore: Math.min(100, Number((contentOnly + nextEngagement).toFixed(2))),
            };
          }
        }

        const region = regionByUserId.get(submission.userId) || "Unknown";
        const anomaly = detectAnomaly({
          submission: { ...submission, metrics: nextMetrics },
          prevMetrics,
          regionAverageImpressions: regionAvgMap.get(region) || 0,
          followerCount,
        });

        updatedSubmission.flaggedForReview = anomaly.flagged;
        updatedSubmission.flaggedReason = anomaly.reason;

        await db.update<Submission>(SUBMISSIONS_COLLECTION, submission.id, updatedSubmission);

        if (user && followerCount > 0 && (user.stats?.xFollowers || 0) !== followerCount) {
          await db.update<User>(USERS_COLLECTION, user.id, {
            stats: {
              ...user.stats,
              xFollowers: followerCount,
            },
          });
          userById.set(user.id, {
            ...user,
            stats: {
              ...user.stats,
              xFollowers: followerCount,
            },
          });
        }

        processed += 1;

        pushLog({
          id: `xlog-${Date.now()}-${submission.id}-updated`,
          timestamp: new Date().toISOString(),
          region: targetRegion,
          submissionId: submission.id,
          userId: submission.userId,
          userName,
          postUrl: submission.postUrl,
          type: "updated",
          message: `Updated metrics for tweet ${tweetId}`,
          critical: false,
        });
      } catch (error) {
        errors += 1;
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("X API error 429") || message.includes("X user API error 429")) {
          hitRateLimit = true;
          rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
          xMetricsStatus.rateLimitedUntil = new Date(rateLimitedUntil).toISOString();
          clearRegionQueue();
          nextCycleAt = rateLimitedUntil;
          if (scheduleTimer) {
            clearTimeout(scheduleTimer);
          }
          scheduleTimer = setTimeout(() => {
            void startDailyRegionQueue("rate-limit-restart");
          }, Math.max(1, rateLimitedUntil - Date.now()));
          updateNextScheduledRunAt();
        }
        pushLog({
          id: `xlog-${Date.now()}-${submission.id}-error`,
          timestamp: new Date().toISOString(),
          region: targetRegion,
          submissionId: submission.id,
          userId: submission.userId,
          userName,
          postUrl: submission.postUrl,
          type: "error",
          message,
          critical: isCriticalError(message),
        });
        if (hitRateLimit) break;
      }
      // Space requests to reduce X API burst pressure.
      await new Promise((resolve) => setTimeout(resolve, REQUEST_SPACING_MS));
    }

    if (processed > 0) {
      await recomputeAllUserPerformance();
    }

    if (!hitRateLimit) {
      // mark this region as run once the batch completes (or queue exhausted)
      xMetricsStatus.regionLastRunAt[targetRegion] = new Date().toISOString();
    }

    const durationMs = Date.now() - startedAt;
    xMetricsStatus.lastRunAt = new Date().toISOString();
    xMetricsStatus.lastRegion = targetRegion;
    xMetricsStatus.lastProcessed = processed;
    xMetricsStatus.lastErrors = errors;
    xMetricsStatus.lastRemaining = remaining;
    xMetricsStatus.lastDurationMs = durationMs;
    pruneLogs();

    return { processed, remaining, errors, region: targetRegion };
  } finally {
    runInProgress = false;
    xMetricsStatus.running = false;
  }
}

export function startXMetricsScheduler() {
  if (scheduleTimer || regionQueueTimers.length > 0) return;
  void startDailyRegionQueue("startup");
}

async function startDailyRegionQueue(reason: string) {
  if (Date.now() < rateLimitedUntil) {
    nextCycleAt = rateLimitedUntil;
    if (scheduleTimer) {
      clearTimeout(scheduleTimer);
    }
    scheduleTimer = setTimeout(() => {
      void startDailyRegionQueue("rate-limit-resume");
    }, Math.max(1, rateLimitedUntil - Date.now()));
    updateNextScheduledRunAt();
    return;
  }

  clearRegionQueue();
  const cycleStart = Date.now();
  nextCycleAt = cycleStart + DAY_MS;

  try {
    const users = await db.getCollection<User>(USERS_COLLECTION);
    const regions = getRegions(users);
    xMetricsStatus.regions = regions;

    for (let index = 0; index < regions.length; index++) {
      const region = regions[index];
      const runAt = cycleStart + index * HOURLY_MS;
      queuedRegionRuns.push({ region, runAt });
      const timer = setTimeout(async () => {
        queuedRegionRuns = queuedRegionRuns.filter((item) => !(item.region === region && item.runAt === runAt));
        updateNextScheduledRunAt();
        try {
          await runXMetricsTrackingBatch("daily-region", region);
        } catch {
        } finally {
          updateNextScheduledRunAt();
        }
      }, Math.max(1, runAt - Date.now()));
      regionQueueTimers.push(timer);
    }
  } catch {
  }

  if (scheduleTimer) {
    clearTimeout(scheduleTimer);
  }
  scheduleTimer = setTimeout(() => {
    void startDailyRegionQueue("daily-cycle");
  }, Math.max(1, nextCycleAt - Date.now()));

  xMetricsStatus.lastReason = reason;
  updateNextScheduledRunAt();
}

export function getXMetricsStatus(): XMetricsStatus {
  pruneLogs();
  if (rateLimitedUntil && Date.now() >= rateLimitedUntil) {
    rateLimitedUntil = 0;
    xMetricsStatus.rateLimitedUntil = undefined;
  }
  return {
    ...xMetricsStatus,
    configured: !!getTwitterToken(),
    running: runInProgress,
  };
}
