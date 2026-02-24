import { db } from "@/backend/db";
import { computeEngagementScore, scoreBuckets } from "@/backend/services/performance";
import type { AmbassadorPost, Submission, Task, User } from "@/types";

const SUBMISSIONS_COLLECTION = "submissions";
const USERS_COLLECTION = "users";
const POSTS_COLLECTION = "ambassador_posts";
const TASKS_COLLECTION = "tasks";

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
  const [submissions, users, tasks] = await Promise.all([
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    db.getCollection<User>(USERS_COLLECTION),
    db.getCollection<Task>(TASKS_COLLECTION),
  ]);

  const total = submissions.length;
  const approved = submissions.filter((s) => s.status === "approved");
  const approvalRate = total > 0 ? approved.length / total : 0;

  const scores = approved.map((s) => s.rating?.totalScore || 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const normalizedScores = scores.map((score) => Number((score / 5).toFixed(2)));
  const averageContentScore = normalizedScores.length > 0
    ? normalizedScores.reduce((sum, value) => sum + value, 0) / normalizedScores.length
    : 0;

  const scoreDistribution20 = {
    "0-5": 0,
    "5-10": 0,
    "10-15": 0,
    "15-20": 0,
  };
  for (const score of normalizedScores) {
    if (score < 5) scoreDistribution20["0-5"] += 1;
    else if (score < 10) scoreDistribution20["5-10"] += 1;
    else if (score < 15) scoreDistribution20["10-15"] += 1;
    else scoreDistribution20["15-20"] += 1;
  }

  const submissionsPerPlatform = submissions.reduce<Record<string, number>>((acc, submission) => {
    const key = submission.platform || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const regionByUserId = new Map(users.map((user) => [user.id, user.region || "Unknown"]));
  const submissionsPerRegion = submissions.reduce<Record<string, number>>((acc, submission) => {
    const region = regionByUserId.get(submission.userId) || "Unknown";
    acc[region] = (acc[region] || 0) + 1;
    return acc;
  }, {});

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
  const totalImpressions = approved.reduce((sum, item) => sum + (item.metrics?.impressions || 0), 0);
  const impressionsByRegion = approved.reduce<Record<string, { total: number; count: number }>>((acc, item) => {
    const region = regionByUserId.get(item.userId) || "Unknown";
    const current = acc[region] || { total: 0, count: 0 };
    current.total += item.metrics?.impressions || 0;
    current.count += 1;
    acc[region] = current;
    return acc;
  }, {});
  const averageImpressionsPerRegion = Object.entries(impressionsByRegion).reduce<Record<string, number>>((acc, [region, value]) => {
    acc[region] = value.count > 0 ? value.total / value.count : 0;
    return acc;
  }, {});

  const engagementCurve = {
    "0-99": 0,
    "100-999": 0,
    "1k-4.9k": 0,
    "5k-9.9k": 0,
    "10k+": 0,
  };
  for (const item of approved) {
    const impressions = item.metrics?.impressions || 0;
    if (impressions < 100) engagementCurve["0-99"] += 1;
    else if (impressions < 1_000) engagementCurve["100-999"] += 1;
    else if (impressions < 5_000) engagementCurve["1k-4.9k"] += 1;
    else if (impressions < 10_000) engagementCurve["5k-9.9k"] += 1;
    else engagementCurve["10k+"] += 1;
  }

  const weekKeyNow = toWeekKey();
  const activeUsers = users.filter((user) => user.status === "active");
  const submittedThisWeek = new Set(
    submissions
      .filter((submission) => toWeekKey(submission.submittedAt) === weekKeyNow)
      .map((submission) => submission.userId)
  );
  const activeAmbassadorsThisWeek = activeUsers.filter((user) => submittedThisWeek.has(user.id)).length;
  const inactiveAmbassadors = activeUsers.length - activeAmbassadorsThisWeek;

  const reviewedDurationsHours = submissions
    .filter((submission) => Boolean(submission.reviewedAt))
    .map((submission) => {
      const submittedTs = Date.parse(submission.submittedAt || "");
      const reviewedTs = Date.parse(submission.reviewedAt || "");
      if (Number.isNaN(submittedTs) || Number.isNaN(reviewedTs) || reviewedTs < submittedTs) {
        return null;
      }
      return (reviewedTs - submittedTs) / 3_600_000;
    })
    .filter((value): value is number => value !== null);
  const averageReviewTimeHours = reviewedDurationsHours.length > 0
    ? reviewedDurationsHours.reduce((sum, value) => sum + value, 0) / reviewedDurationsHours.length
    : 0;

  const timeToFirstSubmissionHours = users
    .map((user) => {
      const joinedTs = Date.parse(user.joinedAt || "");
      if (Number.isNaN(joinedTs)) return null;
      const firstSubmissionTs = submissions
        .filter((submission) => submission.userId === user.id)
        .map((submission) => Date.parse(submission.submittedAt || ""))
        .filter((ts) => !Number.isNaN(ts))
        .sort((a, b) => a - b)[0];
      if (!firstSubmissionTs || firstSubmissionTs < joinedTs) return null;
      return (firstSubmissionTs - joinedTs) / 3_600_000;
    })
    .filter((value): value is number => value !== null);
  const averageTimeToSubmissionHours = timeToFirstSubmissionHours.length > 0
    ? timeToFirstSubmissionHours.reduce((sum, value) => sum + value, 0) / timeToFirstSubmissionHours.length
    : 0;

  const activeTaskCount = tasks.filter((task) => task.status === "active").length;
  const activeAmbassadorCount = Math.max(1, activeUsers.filter((user) => user.role === "ambassador").length);
  const completedTasksByAmbassadors = activeUsers
    .filter((user) => user.role === "ambassador")
    .reduce((sum, user) => sum + (user.stats?.completedTasks || 0), 0);
  const taskCompletionRate = activeTaskCount > 0
    ? completedTasksByAmbassadors / (activeTaskCount * activeAmbassadorCount)
    : 0;

  const sortedScores = [...normalizedScores].sort((a, b) => a - b);
  const decileSize = Math.max(1, Math.floor(sortedScores.length * 0.1));
  const bottomDecile = sortedScores.slice(0, decileSize);
  const topDecile = sortedScores.slice(Math.max(0, sortedScores.length - decileSize));
  const bottomAverage = bottomDecile.length > 0
    ? bottomDecile.reduce((sum, value) => sum + value, 0) / bottomDecile.length
    : 0;
  const topAverage = topDecile.length > 0
    ? topDecile.reduce((sum, value) => sum + value, 0) / topDecile.length
    : 0;
  const topBottomSpread = topAverage - bottomAverage;

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
    volume: {
      totalSubmissions: total,
      submissionsPerPlatform,
      submissionsPerRegion,
      activeAmbassadorsThisWeek,
      inactiveAmbassadors,
    },
    quality: {
      approvalRate,
      averageContentScore,
      scoreDistribution20,
      topBottomSpread,
      topDecileAverage: topAverage,
      bottomDecileAverage: bottomAverage,
    },
    engagement: {
      totalImpressions,
      averageImpressionsPerSubmission: totalImpressions / denominator,
      averageImpressionsPerRegion,
      distributionCurve: engagementCurve,
    },
    speed: {
      averageReviewTimeHours,
      averageTimeToSubmissionHours,
      taskCompletionRate,
    },
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
