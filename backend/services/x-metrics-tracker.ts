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
const MAX_BATCH = 20;
const FOLLOW_UP_DELAY_MS = 30 * 60 * 1000;
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
let followUpTimer: ReturnType<typeof setTimeout> | null = null;
let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
let regionCursor = 0;
let followUpRegion: string | null = null;

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

function clearFollowUpTimer() {
  if (followUpTimer) {
    clearTimeout(followUpTimer);
    followUpTimer = null;
    followUpRegion = null;
  }
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

export async function runXMetricsTrackingBatch(reason = "scheduled", regionOverride?: string): Promise<{ processed: number; remaining: number; errors: number; region?: string }> {
  if (runInProgress) {
    return { processed: 0, remaining: 0, errors: 0, region: regionOverride };
  }

  runInProgress = true;
  xMetricsStatus.running = true;
  xMetricsStatus.lastReason = reason;
  const startedAt = Date.now();

  let processed = 0;
  let errors = 0;
  let remaining = 0;
  let targetRegion = regionOverride;

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

    const regionByUserId = new Map(users.map((u) => [u.id, u.region]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const regionEligible = submissions.filter(
      (submission) => canTrackSubmission(submission) && (regionByUserId.get(submission.userId) || "Unknown") === targetRegion
    );

    // mark this region as run when we begin processing it
    xMetricsStatus.regionLastRunAt[targetRegion] = new Date().toISOString();

    const queue = regionEligible.slice(0, MAX_BATCH);
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
          const thresholdScore = computeXEngagementScoreFromImpressions(xMetrics.impressions);
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
        });

        updatedSubmission.flaggedForReview = anomaly.flagged;
        updatedSubmission.flaggedReason = anomaly.reason;

        await db.update<Submission>(SUBMISSIONS_COLLECTION, submission.id, updatedSubmission);
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
      }
    }

    if (processed > 0) {
      await recomputeAllUserPerformance();
    }

    if (remaining > 0) {
      clearFollowUpTimer();
      followUpRegion = targetRegion;
      followUpTimer = setTimeout(() => {
        void runXMetricsTrackingBatch("follow-up", followUpRegion || undefined);
      }, FOLLOW_UP_DELAY_MS);
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
  if (scheduleTimer) return;

  const scheduleNext = () => {
    xMetricsStatus.nextScheduledRunAt = new Date(Date.now() + HOURLY_MS).toISOString();
    scheduleTimer = setTimeout(async () => {
      try {
        await runXMetricsTrackingBatch("hourly-region");
      } catch {
      } finally {
        scheduleNext();
      }
    }, HOURLY_MS);
  };

  void runXMetricsTrackingBatch("startup");
  scheduleNext();
}

export function getXMetricsStatus(): XMetricsStatus {
  pruneLogs();
  return {
    ...xMetricsStatus,
    configured: !!getTwitterToken(),
    running: runInProgress,
  };
}
