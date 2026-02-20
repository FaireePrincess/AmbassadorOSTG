import { db } from "@/backend/db";
import type { Submission, User } from "@/types";
import {
  computeEngagementScore,
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

  const twitterLink = links.find((item) => {
    const platform = normalizePlatform(item.platform);
    return platform === "twitter";
  });

  if (!twitterLink?.url) return null;
  return twitterLink.url;
}

function canTrackSubmission(submission: Submission): boolean {
  if (submission.status !== "approved") return false;
  const twitterUrl = getSubmissionTwitterUrl(submission);
  if (!twitterUrl) return false;
  const tweetId = extractTweetId(twitterUrl);
  if (!tweetId) return false;

  const expiry = getTrackingExpiry(submission);
  if (!expiry) return false;
  return isWithinTrackingWindow(expiry);
}

let runInProgress = false;
let followUpTimer: ReturnType<typeof setTimeout> | null = null;

function clearFollowUpTimer() {
  if (followUpTimer) {
    clearTimeout(followUpTimer);
    followUpTimer = null;
  }
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

export async function runXMetricsTrackingBatch(reason = "scheduled"): Promise<{ processed: number; remaining: number; errors: number }> {
  if (runInProgress) {
    return { processed: 0, remaining: 0, errors: 0 };
  }

  runInProgress = true;
  const startedAt = Date.now();
  console.log(`[XMetrics] Starting batch (${reason})`);

  let processed = 0;
  let errors = 0;
  let remaining = 0;

  try {
    const token = getTwitterToken();
    if (!token) {
      console.log("[XMetrics] Skipping: TWITTER_BEARER_TOKEN missing");
      return { processed: 0, remaining: 0, errors: 0 };
    }

    const [submissions, users] = await Promise.all([
      db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
      db.getCollection<User>(USERS_COLLECTION),
    ]);

    const eligible = submissions.filter(canTrackSubmission);
    const queue = eligible.slice(0, MAX_BATCH);
    remaining = Math.max(0, eligible.length - queue.length);

    const regionByUserId = new Map(users.map((u) => [u.id, u.region]));
    const regionAvgMap = await getRegionAverageImpressionsMap(users, submissions);

    for (const submission of queue) {
      const twitterUrl = getSubmissionTwitterUrl(submission);
      if (!twitterUrl) continue;
      const tweetId = extractTweetId(twitterUrl);
      if (!tweetId) continue;

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

        const engagementScore = computeEngagementScore({ ...submission, metrics: nextMetrics });
        if (submission.rating) {
          const contentOnly = Math.max(0, (submission.rating.totalScore || 0) - (submission.rating.engagementScore || 0));
          updatedSubmission.rating = {
            ...submission.rating,
            engagementScore,
            totalScore: Math.min(100, Number((contentOnly + engagementScore).toFixed(2))),
          };
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
      } catch (error) {
        errors += 1;
        console.log(`[XMetrics] Failed for submission ${submission.id}:`, error instanceof Error ? error.message : String(error));
      }
    }

    if (processed > 0) {
      await recomputeAllUserPerformance();
    }

    if (remaining > 0) {
      clearFollowUpTimer();
      followUpTimer = setTimeout(() => {
        void runXMetricsTrackingBatch("follow-up");
      }, FOLLOW_UP_DELAY_MS);
      console.log(`[XMetrics] Scheduled follow-up in 30m, remaining ${remaining}`);
    }

    const durationMs = Date.now() - startedAt;
    console.log(`[XMetrics] Batch complete processed=${processed} errors=${errors} remaining=${remaining} durationMs=${durationMs}`);
    return { processed, remaining, errors };
  } finally {
    runInProgress = false;
  }
}

let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

function nextDelayMs(): number {
  const jitterHours = 24 + Math.floor(Math.random() * 3);
  return jitterHours * 60 * 60 * 1000;
}

export function startXMetricsScheduler() {
  if (scheduleTimer) return;

  const scheduleNext = () => {
    const delay = nextDelayMs();
    scheduleTimer = setTimeout(async () => {
      try {
        await runXMetricsTrackingBatch("daily");
      } catch (error) {
        console.log("[XMetrics] Scheduled run error:", error instanceof Error ? error.message : String(error));
      } finally {
        scheduleNext();
      }
    }, delay);

    console.log(`[XMetrics] Next scheduled run in ~${Math.round(delay / (60 * 60 * 1000))}h`);
  };

  void runXMetricsTrackingBatch("startup");
  scheduleNext();
}
