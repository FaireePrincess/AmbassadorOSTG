import { db } from "@/backend/db";
import { ensureActiveSeason, isSubmissionInSeason } from "@/backend/services/season";
import type { Platform, Submission, User } from "@/types";

const USERS_COLLECTION = "users";
const SUBMISSIONS_COLLECTION = "submissions";

export const PLATFORM_ENGAGEMENT_WEIGHTS: Record<string, number> = {
  twitter: 1,
  x: 1,
  instagram: 0.9,
  tiktok: 0.95,
  youtube: 0.85,
  facebook: 0.75,
  telegram: 0.7,
};

export function normalizePlatform(platform?: string): Platform {
  if (!platform) return "twitter";
  if (platform === "x") return "twitter";
  if (platform === "telegram") return "telegram";
  if (platform === "instagram") return "instagram";
  if (platform === "tiktok") return "tiktok";
  if (platform === "youtube") return "youtube";
  if (platform === "facebook") return "facebook";
  return platform as Platform;
}

export function isValidPlatformUrl(platform: Platform, rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  switch (normalizePlatform(platform)) {
    case "twitter":
      return host === "twitter.com" || host === "x.com";
    case "instagram":
      return host === "instagram.com" || host.endsWith(".instagram.com");
    case "tiktok":
      return host === "tiktok.com" || host.endsWith(".tiktok.com");
    case "youtube":
      return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
    case "facebook":
      return host === "facebook.com" || host === "fb.com" || host.endsWith(".facebook.com");
    case "telegram":
      return host === "t.me" || host === "telegram.me" || host.endsWith(".t.me");
    default:
      return true;
  }
}

export function normalizeTwitterUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.hostname === "x.com") {
      url.hostname = "twitter.com";
    }
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return withProtocol;
  }
}

export function extractTweetId(url: string): string | null {
  const patterns = [
    /twitter\.com\/\w+\/status\/(\d+)/i,
    /x\.com\/\w+\/status\/(\d+)/i,
    /(?:^|\D)(\d{8,})(?:\D|$)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function parseMultiLinks(
  platform: Platform,
  postUrl: string,
  platforms?: Platform[],
  links?: Array<{ platform: Platform; url: string }>
): Array<{ platform: Platform; url: string }> {
  const normalizedLinks = Array.isArray(links)
    ? links
        .map((entry) => ({ platform: normalizePlatform(entry.platform), url: entry.url?.trim() || "" }))
        .filter((entry) => entry.url.length > 0)
    : [];

  if (normalizedLinks.length > 0) {
    return normalizedLinks;
  }

  const fallbackUrl = postUrl?.trim() || "";
  if (!fallbackUrl) return [];
  return [{ platform: normalizePlatform(platform), url: fallbackUrl }];
}

export function pickBestEngagementPlatform(submission: Submission): { platform: Platform; score: number } {
  const links = parseMultiLinks(
    normalizePlatform(submission.platform),
    submission.postUrl,
    submission.platforms,
    submission.links
  );

  if (links.length === 0) {
    return { platform: normalizePlatform(submission.platform), score: 0 };
  }

  const metrics = submission.metrics || { impressions: 0, likes: 0, comments: 0, shares: 0 };
  const base = (metrics.impressions * 0.02) + (metrics.likes * 1.2) + (metrics.comments * 1.6) + (metrics.shares * 1.5);

  let best = { platform: links[0].platform, score: 0 };
  for (const link of links) {
    const weight = PLATFORM_ENGAGEMENT_WEIGHTS[normalizePlatform(link.platform)] || 0.8;
    const weighted = base * weight;
    if (weighted > best.score) {
      best = { platform: normalizePlatform(link.platform), score: weighted };
    }
  }

  return best;
}

export function computeEngagementScore(submission: Submission): number {
  const best = pickBestEngagementPlatform(submission);
  const capped = Math.min(20, Math.max(0, best.score));
  return Number(capped.toFixed(2));
}

export function computeXEngagementScoreFromImpressions(impressions: number, followerCount?: number): 0 | 5 | 10 | 15 | 20 {
  const safeImpressions = Math.max(0, impressions || 0);
  const safeFollowers = Math.max(0, followerCount || 0);

  // Fallback to legacy absolute buckets when follower count is unavailable.
  if (safeFollowers <= 0) {
    if (safeImpressions < 500) return 0;
    if (safeImpressions <= 1500) return 5;
    if (safeImpressions <= 5000) return 10;
    if (safeImpressions <= 10000) return 15;
    return 20;
  }

  // Follower-normalized reach ratio (impressions as a multiple of follower base).
  const reachRatio = safeImpressions / safeFollowers;
  if (reachRatio < 0.2) return 0;    // <20% of follower base reached
  if (reachRatio < 0.5) return 5;    // 20-49%
  if (reachRatio < 1.5) return 10;   // 50-149%
  if (reachRatio < 3.0) return 15;   // 150-299%
  return 20;                         // >=300%
}

export function scoreBuckets(scores: number[]): Record<string, number> {
  const buckets: Record<string, number> = {
    "0-19": 0,
    "20-39": 0,
    "40-59": 0,
    "60-79": 0,
    "80-100": 0,
  };

  for (const score of scores) {
    if (score < 20) buckets["0-19"]++;
    else if (score < 40) buckets["20-39"]++;
    else if (score < 60) buckets["40-59"]++;
    else if (score < 80) buckets["60-79"]++;
    else buckets["80-100"]++;
  }

  return buckets;
}

export async function recomputeAllUserPerformance(): Promise<void> {
  const [users, submissions, currentSeason] = await Promise.all([
    db.getCollection<User>(USERS_COLLECTION),
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    ensureActiveSeason(),
  ]);

  const seasonSubmissions = submissions.filter((s) => isSubmissionInSeason(s, currentSeason));
  const approved = seasonSubmissions.filter((s) => s.status === "approved");
  const approvedByUser = new Map<string, Submission[]>();
  const seasonCountByUser = new Map<string, number>();

  for (const submission of seasonSubmissions) {
    seasonCountByUser.set(submission.userId, (seasonCountByUser.get(submission.userId) || 0) + 1);
    if (submission.status !== "approved") continue;
    const list = approvedByUser.get(submission.userId) || [];
    list.push(submission);
    approvedByUser.set(submission.userId, list);
  }

  const refreshedUsers: User[] = users.map((user) => {
    const list = approvedByUser.get(user.id) || [];
    const totalPoints = list.reduce((acc, item) => acc + (item.rating?.totalScore || 0), 0);

    return {
      ...user,
      season_points: Number(totalPoints.toFixed(2)),
      season_rank: null,
      season_submission_count: seasonCountByUser.get(user.id) || 0,
      season_approved_count: list.length,
    };
  });

  const ranked = [...refreshedUsers]
    .filter((u) => u.status === "active")
    .sort((a, b) => (b.season_points || 0) - (a.season_points || 0))
    .map((user, index) => ({ id: user.id, rank: index + 1 }));

  const rankMap = new Map(ranked.map((entry) => [entry.id, entry.rank]));

  await Promise.all(
    refreshedUsers.map((user) =>
      db.update<User>(USERS_COLLECTION, user.id, {
        ...user,
        season_rank: (user.season_points || 0) > 0 ? (rankMap.get(user.id) || null) : null,
      })
    )
  );
}

export function isWithinTrackingWindow(expiresAt?: string): boolean {
  if (!expiresAt) return false;
  const ts = Date.parse(expiresAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() < ts;
}

export function detectAnomaly(args: {
  submission: Submission;
  prevMetrics?: { impressions: number; likes: number; comments: number; shares: number };
  regionAverageImpressions: number;
  followerCount?: number;
}): { flagged: boolean; reason?: string } {
  const metrics = args.submission.metrics || { impressions: 0, likes: 0, comments: 0, shares: 0 };
  const impressions = metrics.impressions || 0;
  const regionalAvg = Math.max(1, args.regionAverageImpressions || 0);

  if (impressions > regionalAvg * 5) {
    return { flagged: true, reason: "Engagement spike > 5x regional average" };
  }

  if (args.followerCount && args.followerCount > 0) {
    const engagement = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0);
    const ratio = engagement / args.followerCount;
    if (ratio > 1.5) {
      return { flagged: true, reason: "Unrealistic engagement-to-follower ratio" };
    }
  }

  if (args.prevMetrics) {
    const prevImpressions = Math.max(1, args.prevMetrics.impressions || 0);
    if (impressions > prevImpressions * 4) {
      return { flagged: true, reason: "Sudden extreme growth within one fetch cycle" };
    }
  }

  return { flagged: false };
}
