import { db } from "@/backend/db";
import { computeEngagementScore, scoreBuckets } from "@/backend/services/performance";
import type { AmbassadorPost, Submission, User } from "@/types";

const SUBMISSIONS_COLLECTION = "submissions";
const USERS_COLLECTION = "users";
const POSTS_COLLECTION = "ambassador_posts";

function toWeekKey(dateValue?: string): string {
  const now = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(now.getTime())) return "unknown";
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function getProgramAnalytics() {
  const submissions = await db.getCollection<Submission>(SUBMISSIONS_COLLECTION);

  const total = submissions.length;
  const approved = submissions.filter((s) => s.status === "approved");
  const approvalRate = total > 0 ? approved.length / total : 0;

  const scores = approved.map((s) => s.rating?.totalScore || 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const engagementAverages = approved.reduce(
    (acc, item) => {
      acc.impressions += item.metrics?.impressions || 0;
      acc.likes += item.metrics?.likes || 0;
      acc.comments += item.metrics?.comments || 0;
      acc.shares += item.metrics?.shares || 0;
      acc.score += computeEngagementScore(item);
      return acc;
    },
    { impressions: 0, likes: 0, comments: 0, shares: 0, score: 0 }
  );

  const denominator = Math.max(1, approved.length);
  const trends = new Map<string, { total: number; approved: number; scoreSum: number; engagementSum: number }>();

  for (const submission of submissions) {
    const week = toWeekKey(submission.submittedAt);
    const entry = trends.get(week) || { total: 0, approved: 0, scoreSum: 0, engagementSum: 0 };
    entry.total += 1;
    if (submission.status === "approved") {
      entry.approved += 1;
      entry.scoreSum += submission.rating?.totalScore || 0;
      entry.engagementSum += computeEngagementScore(submission);
    }
    trends.set(week, entry);
  }

  return {
    totalSubmissions: total,
    approvalRate,
    averageScore: avgScore,
    scoreDistribution: scoreBuckets(scores),
    engagementAverages: {
      impressions: engagementAverages.impressions / denominator,
      likes: engagementAverages.likes / denominator,
      comments: engagementAverages.comments / denominator,
      shares: engagementAverages.shares / denominator,
      engagementScore: engagementAverages.score / denominator,
    },
    weeklyTrend: [...trends.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, value]) => ({
        week,
        totalSubmissions: value.total,
        approvalRate: value.total > 0 ? value.approved / value.total : 0,
        averageScore: value.approved > 0 ? value.scoreSum / value.approved : 0,
        averageEngagementScore: value.approved > 0 ? value.engagementSum / value.approved : 0,
      })),
  };
}

export async function getRegionalAnalytics() {
  const [submissions, users] = await Promise.all([
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    db.getCollection<User>(USERS_COLLECTION),
  ]);

  const regionByUser = new Map(users.map((u) => [u.id, u.region || "Unknown"]));
  const grouped = new Map<string, {
    submissions: number;
    approved: number;
    scoreSum: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
  }>();

  for (const submission of submissions) {
    const region = regionByUser.get(submission.userId) || "Unknown";
    const entry = grouped.get(region) || {
      submissions: 0,
      approved: 0,
      scoreSum: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };

    entry.submissions += 1;
    if (submission.status === "approved") {
      entry.approved += 1;
      entry.scoreSum += submission.rating?.totalScore || 0;
      entry.impressions += submission.metrics?.impressions || 0;
      entry.likes += submission.metrics?.likes || 0;
      entry.comments += submission.metrics?.comments || 0;
      entry.shares += submission.metrics?.shares || 0;
    }

    grouped.set(region, entry);
  }

  return [...grouped.entries()]
    .map(([region, value]) => {
      const approvedCount = Math.max(1, value.approved);
      return {
        region,
        submissions: value.submissions,
        approvalRate: value.submissions > 0 ? value.approved / value.submissions : 0,
        averageScore: value.approved > 0 ? value.scoreSum / value.approved : 0,
        engagement: {
          impressions: value.impressions / approvedCount,
          likes: value.likes / approvedCount,
          comments: value.comments / approvedCount,
          shares: value.shares / approvedCount,
        },
      };
    })
    .sort((a, b) => b.submissions - a.submissions);
}

export async function getRegionalLeaderboard(region: string, limit = 20) {
  const users = await db.getCollection<User>(USERS_COLLECTION);
  return users
    .filter((u) => u.status === "active" && u.region === region)
    .sort((a, b) => b.points - a.points)
    .slice(0, limit)
    .map((u, idx) => ({
      rank: idx + 1,
      userId: u.id,
      name: u.name,
      region: u.region,
      points: u.points,
      posts: u.stats.totalPosts,
      impressions: u.stats.totalImpressions,
    }));
}

export async function getRegionalActivityFeed(region: string, limit = 20) {
  const posts = await db.getCollection<AmbassadorPost>(POSTS_COLLECTION);
  return posts
    .filter((p) => p.userRegion === region)
    .sort((a, b) => Date.parse(b.postedAt || "") - Date.parse(a.postedAt || ""))
    .slice(0, limit);
}

export async function getAmbassadorDirectory() {
  const users = await db.getCollection<User>(USERS_COLLECTION);
  return users
    .filter((u) => u.status === "active")
    .map((u) => ({
      id: u.id,
      name: u.name,
      region: u.region,
      role: u.role,
      avatar: u.avatar,
      handles: u.handles,
      username: u.username,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
