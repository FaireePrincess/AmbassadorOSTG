import { db } from "@/backend/db";
import { computeEngagementScore, scoreBuckets } from "@/backend/services/performance";
import { ensureActiveSeason, isSubmissionInSeason, isTaskInSeason, listSeasons } from "@/backend/services/season";
import type { AmbassadorPost, ExtraContentSubmission, Season, Submission, Task, User } from "@/types";

const SUBMISSIONS_COLLECTION = "submissions";
const EXTRA_CONTENT_COLLECTION = "extra_content_submissions";
const USERS_COLLECTION = "users";
const POSTS_COLLECTION = "ambassador_posts";
const TASKS_COLLECTION = "tasks";

function getSavedOrComputedEngagementScore(submission: Submission): number {
  if (typeof submission.rating?.engagementScore === "number") {
    return submission.rating.engagementScore;
  }
  return computeEngagementScore(submission);
}

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

async function resolveSeason(seasonId?: string): Promise<{ season: Season; isCurrentSeason: boolean }> {
  const [currentSeason, seasons] = await Promise.all([ensureActiveSeason(), listSeasons()]);
  if (!seasonId || seasonId === currentSeason.id) {
    return { season: currentSeason, isCurrentSeason: true };
  }

  const season = seasons.find((item) => item.id === seasonId);
  if (!season) {
    throw new Error("Season not found");
  }

  return { season, isCurrentSeason: season.id === currentSeason.id };
}

function getReferenceWeekKey(seasonSubmissions: Submission[]): string {
  const latestWeek = seasonSubmissions
    .map((submission) => toWeekKey(submission.submittedAt))
    .filter((value) => value !== "unknown")
    .sort((a, b) => a.localeCompare(b))
    .at(-1);

  return latestWeek || toWeekKey();
}

function getCompletionRateTaskScope(season: Season, seasonTasks: Task[]): Task[] {
  if (season.status === "closed") {
    return seasonTasks.filter((task) => task.status !== "upcoming");
  }
  return seasonTasks.filter((task) => task.status === "active");
}

function normalizeCampaignKey(campaignId?: string, campaignTitle?: string): string {
  const titleKey = (campaignTitle || "").trim().toLowerCase();
  if (titleKey) return titleKey;
  return (campaignId || "").trim().toLowerCase();
}

function parseDateValue(value?: string): number {
  const ts = Date.parse(value || "");
  return Number.isNaN(ts) ? 0 : ts;
}

function buildCampaignResults(args: {
  seasonTasks: Task[];
  seasonSubmissions: Submission[];
}): Array<{
  campaignId: string;
  campaignTitle: string;
  tasks: number;
  submissions: number;
  approvedSubmissions: number;
  approvalRate: number;
  completionRate: number | null;
  averageScore: number;
  totalImpressions: number;
  averageImpressions: number;
  submissionsPerPlatform: Record<string, number>;
  latestActivityAt?: string;
}> {
  const { seasonTasks, seasonSubmissions } = args;
  const campaignMap = new Map<string, {
    campaignId: string;
    campaignTitle: string;
    taskIds: Set<string>;
    submissions: number;
    approvedSubmissions: number;
    scoreSum: number;
    totalImpressions: number;
    approvedTaskIds: Set<string>;
    submissionsPerPlatform: Record<string, number>;
    latestActivityTs: number;
    latestActivityAt?: string;
  }>();

  for (const task of seasonTasks) {
    const key = normalizeCampaignKey(task.campaignId, task.campaignTitle) || task.id;
    const latestActivityTs = parseDateValue(task.deadline);
    const entry = campaignMap.get(key) || {
      campaignId: key,
      campaignTitle: task.campaignTitle || "Untitled Campaign",
      taskIds: new Set<string>(),
      submissions: 0,
      approvedSubmissions: 0,
      scoreSum: 0,
      totalImpressions: 0,
      approvedTaskIds: new Set<string>(),
      submissionsPerPlatform: {},
      latestActivityTs,
      latestActivityAt: task.deadline,
    };
    entry.taskIds.add(task.id);
    if (latestActivityTs >= entry.latestActivityTs) {
      entry.latestActivityTs = latestActivityTs;
      entry.latestActivityAt = task.deadline || entry.latestActivityAt;
    }
    campaignMap.set(key, entry);
  }

  const taskCampaignKey = new Map<string, string>();
  for (const task of seasonTasks) {
    taskCampaignKey.set(task.id, normalizeCampaignKey(task.campaignId, task.campaignTitle) || task.id);
  }

  for (const submission of seasonSubmissions) {
    const key =
      taskCampaignKey.get(submission.taskId) ||
      normalizeCampaignKey(undefined, submission.campaignTitle) ||
      submission.taskId;
    const latestActivityTs = parseDateValue(submission.submittedAt);
    const entry = campaignMap.get(key) || {
      campaignId: key,
      campaignTitle: submission.campaignTitle || "Untitled Campaign",
      taskIds: new Set<string>(),
      submissions: 0,
      approvedSubmissions: 0,
      scoreSum: 0,
      totalImpressions: 0,
      approvedTaskIds: new Set<string>(),
      submissionsPerPlatform: {},
      latestActivityTs,
      latestActivityAt: submission.submittedAt,
    };

    entry.submissions += 1;
    const platformKey = submission.platform || "unknown";
    entry.submissionsPerPlatform[platformKey] = (entry.submissionsPerPlatform[platformKey] || 0) + 1;
    if (latestActivityTs >= entry.latestActivityTs) {
      entry.latestActivityTs = latestActivityTs;
      entry.latestActivityAt = submission.submittedAt || entry.latestActivityAt;
    }

    if (submission.status === "approved") {
      entry.approvedSubmissions += 1;
      entry.scoreSum += submission.rating?.totalScore || 0;
      entry.totalImpressions += submission.metrics?.impressions || 0;
      if (entry.taskIds.has(submission.taskId)) {
        entry.approvedTaskIds.add(submission.taskId);
      }
    }

    campaignMap.set(key, entry);
  }

  return [...campaignMap.values()]
    .map((entry) => {
      const taskCount = entry.taskIds.size;
      const approvedCount = entry.approvedSubmissions;
      return {
        campaignId: entry.campaignId,
        campaignTitle: entry.campaignTitle,
        tasks: taskCount,
        submissions: entry.submissions,
        approvedSubmissions: approvedCount,
        approvalRate: entry.submissions > 0 ? approvedCount / entry.submissions : 0,
        completionRate: taskCount > 0 ? entry.approvedTaskIds.size / taskCount : null,
        averageScore: approvedCount > 0 ? entry.scoreSum / approvedCount : 0,
        totalImpressions: entry.totalImpressions,
        averageImpressions: approvedCount > 0 ? entry.totalImpressions / approvedCount : 0,
        submissionsPerPlatform: entry.submissionsPerPlatform,
        latestActivityAt: entry.latestActivityAt,
      };
    })
    .sort((a, b) => {
      const aTs = parseDateValue(a.latestActivityAt);
      const bTs = parseDateValue(b.latestActivityAt);
      if (bTs !== aTs) return bTs - aTs;
      if (b.submissions !== a.submissions) return b.submissions - a.submissions;
      return a.campaignTitle.localeCompare(b.campaignTitle);
    });
}

export function computeSeasonTaskCompletionRate(args: {
  seasonTasks: Task[];
  seasonSubmissions: Submission[];
  completionStatus?: "approved" | "any_submitted";
}): number {
  const { seasonTasks, seasonSubmissions, completionStatus = "approved" } = args;
  const activeSeasonTasks = seasonTasks.filter((task) => task.status === "active");
  const totalTasks = activeSeasonTasks.length;
  if (totalTasks <= 0) return 0;

  const activeTaskIds = new Set(activeSeasonTasks.map((task) => task.id));
  const qualifying = completionStatus === "approved"
    ? seasonSubmissions.filter((submission) => submission.status === "approved")
    : seasonSubmissions;
  const completedTaskIds = new Set(
    qualifying
      .map((submission) => submission.taskId)
      .filter((taskId) => activeTaskIds.has(taskId))
  );
  return completedTaskIds.size / totalTasks;
}

export async function getProgramAnalytics(seasonId?: string) {
  const [{ season, isCurrentSeason }, submissions, extraContent, users, tasks] = await Promise.all([
    resolveSeason(seasonId),
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    db.getCollection<ExtraContentSubmission>(EXTRA_CONTENT_COLLECTION),
    db.getCollection<User>(USERS_COLLECTION),
    db.getCollection<Task>(TASKS_COLLECTION),
  ]);
  const seasonSubmissions = submissions.filter((submission) => isSubmissionInSeason(submission, season));
  const seasonExtraContent = extraContent.filter((item) => isSubmissionInSeason(item, season));
  const seasonTasks = tasks.filter((task) => isTaskInSeason(task, season));
  const completionScopeTasks = getCompletionRateTaskScope(season, seasonTasks);

  const total = seasonSubmissions.length;
  const approved = seasonSubmissions.filter((s) => s.status === "approved");
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

  const submissionsPerPlatform = seasonSubmissions.reduce<Record<string, number>>((acc, submission) => {
    const key = submission.platform || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const regionByUserId = new Map(users.map((user) => [user.id, user.region || "Unknown"]));
  const submissionsPerRegion = seasonSubmissions.reduce<Record<string, number>>((acc, submission) => {
    const region = regionByUserId.get(submission.userId) || "Unknown";
    acc[region] = (acc[region] || 0) + 1;
    return acc;
  }, {});
  const extraContentPerRegion = seasonExtraContent.reduce<Record<string, number>>((acc, item) => {
    const region = regionByUserId.get(item.userId) || "Unknown";
    acc[region] = (acc[region] || 0) + 1;
    return acc;
  }, {});
  const extraContentImpressions = seasonExtraContent.reduce((sum, item) => sum + (item.metrics?.impressions || 0), 0);

  const engagementAverages = approved.reduce(
    (acc, item) => {
      acc.impressions += item.metrics?.impressions || 0;
      acc.likes += item.metrics?.likes || 0;
      acc.comments += item.metrics?.comments || 0;
      acc.shares += item.metrics?.shares || 0;
      acc.score += getSavedOrComputedEngagementScore(item);
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

  const referenceWeekKey = getReferenceWeekKey(seasonSubmissions);
  const activeUsers = users.filter((user) => user.status === "active");
  const submittedThisWeek = new Set(
    seasonSubmissions
      .filter((submission) => toWeekKey(submission.submittedAt) === referenceWeekKey)
      .map((submission) => submission.userId)
  );
  const activeAmbassadorsThisWeek = activeUsers.filter((user) => submittedThisWeek.has(user.id)).length;
  const inactiveAmbassadors = activeUsers.length - activeAmbassadorsThisWeek;

  const reviewedDurationsHours = seasonSubmissions
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
      const firstSubmissionTs = seasonSubmissions
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

  const taskCompletionRate = computeSeasonTaskCompletionRate({
    seasonTasks: completionScopeTasks,
    seasonSubmissions,
    completionStatus: "approved",
  });

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

  for (const submission of seasonSubmissions) {
    const week = toWeekKey(submission.submittedAt);
    const entry = trends.get(week) || { total: 0, approved: 0, scoreSum: 0, engagementSum: 0 };
    entry.total += 1;
    if (submission.status === "approved") {
      entry.approved += 1;
      entry.scoreSum += submission.rating?.totalScore || 0;
      entry.engagementSum += getSavedOrComputedEngagementScore(submission);
    }
    trends.set(week, entry);
  }

  const campaigns = buildCampaignResults({
    seasonTasks,
    seasonSubmissions,
  });

  return {
    season: {
      id: season.id,
      name: season.name,
      number: season.number,
      status: season.status,
      startedAt: season.startedAt,
      endedAt: season.endedAt,
      isCurrent: isCurrentSeason,
      referenceWeekKey,
      totalTasks: seasonTasks.length,
      scopedTaskCount: completionScopeTasks.length,
      totalApprovedSubmissions: approved.length,
    },
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
    extraContent: {
      totalSubmissions: seasonExtraContent.length,
      totalImpressions: extraContentImpressions,
      averageImpressionsPerSubmission: seasonExtraContent.length > 0 ? extraContentImpressions / seasonExtraContent.length : 0,
      submissionsPerRegion: extraContentPerRegion,
    },
    speed: {
      averageReviewTimeHours,
      averageTimeToSubmissionHours,
      taskCompletionRate,
    },
    campaigns,
  };
}

export async function getRegionalAnalytics() {
  const [submissions, extraContent, users, currentSeason] = await Promise.all([
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    db.getCollection<ExtraContentSubmission>(EXTRA_CONTENT_COLLECTION),
    db.getCollection<User>(USERS_COLLECTION),
    ensureActiveSeason(),
  ]);
  const seasonSubmissions = submissions.filter((submission) => isSubmissionInSeason(submission, currentSeason));
  const seasonExtraContent = extraContent.filter((item) => isSubmissionInSeason(item, currentSeason));

  const regionByUser = new Map(users.map((u) => [u.id, u.region || "Unknown"]));
  const extraByRegion = seasonExtraContent.reduce<Map<string, { submissions: number; impressions: number }>>((map, item) => {
    const region = regionByUser.get(item.userId) || "Unknown";
    const entry = map.get(region) || { submissions: 0, impressions: 0 };
    entry.submissions += 1;
    entry.impressions += item.metrics?.impressions || 0;
    map.set(region, entry);
    return map;
  }, new Map());
  const grouped = new Map<string, {
    submissions: number;
    approved: number;
    scoreSum: number;
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
  }>();

  for (const submission of seasonSubmissions) {
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
        extraContent: {
          submissions: extraByRegion.get(region)?.submissions || 0,
          impressions: extraByRegion.get(region)?.impressions || 0,
        },
      };
    })
    .sort((a, b) => b.submissions - a.submissions);
}

export async function getRegionalLeaderboard(region: string, limit = 20) {
  const [users, submissions, currentSeason] = await Promise.all([
    db.getCollection<User>(USERS_COLLECTION),
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    ensureActiveSeason(),
  ]);
  const seasonSubmissions = submissions.filter((submission) => isSubmissionInSeason(submission, currentSeason));
  const seasonImpressionsByUser = seasonSubmissions.reduce<Map<string, number>>((map, submission) => {
    if (submission.status !== "approved") return map;
    map.set(submission.userId, (map.get(submission.userId) || 0) + (submission.metrics?.impressions || 0));
    return map;
  }, new Map());
  return users
    .filter((u) => u.status === "active" && u.region === region)
    .sort((a, b) => (b.season_points || 0) - (a.season_points || 0))
    .slice(0, limit)
    .map((u, idx) => ({
      rank: idx + 1,
      userId: u.id,
      name: u.name,
      region: u.region,
      points: u.season_points || 0,
      posts: u.season_submission_count || 0,
      impressions: seasonImpressionsByUser.get(u.id) || 0,
    }));
}

export async function getRegionalActivityFeed(region: string, limit = 20) {
  const [posts, submissions, currentSeason] = await Promise.all([
    db.getCollection<AmbassadorPost>(POSTS_COLLECTION),
    db.getCollection<Submission>(SUBMISSIONS_COLLECTION),
    ensureActiveSeason(),
  ]);
  const seasonSubmissionIds = new Set(
    submissions.filter((submission) => isSubmissionInSeason(submission, currentSeason)).map((submission) => submission.id)
  );
  return posts
    .filter((p) => {
      if (p.userRegion !== region) return false;
      const sourceSubmissionId = (p as AmbassadorPost & { sourceSubmissionId?: string }).sourceSubmissionId;
      if (sourceSubmissionId) return seasonSubmissionIds.has(sourceSubmissionId);
      const postedTs = Date.parse(p.postedAt || "");
      const seasonStartTs = Date.parse(currentSeason.startedAt || "");
      const seasonEndTs = currentSeason.endedAt ? Date.parse(currentSeason.endedAt) : null;
      if (Number.isNaN(postedTs) || Number.isNaN(seasonStartTs)) return false;
      if (postedTs < seasonStartTs) return false;
      if (seasonEndTs !== null && !Number.isNaN(seasonEndTs) && postedTs >= seasonEndTs) return false;
      return true;
    })
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
