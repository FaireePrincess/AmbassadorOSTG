import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { db } from "@/backend/db";
import type { Season, Submission, Task, User } from "@/types";

const COLLECTION = "seasons";

function sortByNumberDesc(seasons: Season[]): Season[] {
  return [...seasons].sort((a, b) => b.number - a.number);
}

async function getSeasons(): Promise<Season[]> {
  const seasons = await db.getCollection<Season>(COLLECTION);
  return sortByNumberDesc(seasons);
}

async function ensureActiveSeason(): Promise<Season> {
  const seasons = await getSeasons();
  const active = seasons.find((season) => season.status === "active");
  if (active) {
    return active;
  }

  const maxNumber = seasons.length > 0 ? Math.max(...seasons.map((season) => season.number)) : 0;
  const newSeasonNumber = maxNumber + 1;
  const nowIso = new Date().toISOString();
  const season: Season = {
    id: `season-${newSeasonNumber}-${Date.now()}`,
    number: newSeasonNumber,
    name: `Season ${newSeasonNumber}`,
    status: "active",
    startedAt: nowIso,
  };

  await db.create<Season>(COLLECTION, season);
  return season;
}

export const seasonsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    await ensureActiveSeason();
    return getSeasons();
  }),

  getCurrent: publicProcedure.query(async () => {
    return ensureActiveSeason();
  }),

  closeAndStartNew: publicProcedure
    .input(
      z.object({
        adminUserId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const users = await db.getCollection<User>("users");
      const admin = users.find((user) => user.id === input.adminUserId);
      if (!admin || admin.role !== "admin" || admin.status !== "active") {
        throw new Error("Only an active admin can close a season.");
      }

      const currentSeason = await ensureActiveSeason();
      const nowIso = new Date().toISOString();
      const closedSeason: Season = {
        ...currentSeason,
        status: "closed",
        endedAt: nowIso,
        closedByUserId: admin.id,
        closedByName: admin.name,
      };
      await db.update<Season>(COLLECTION, currentSeason.id, closedSeason);

      const nextSeasonNumber = currentSeason.number + 1;
      const nextSeason: Season = {
        id: `season-${nextSeasonNumber}-${Date.now()}`,
        number: nextSeasonNumber,
        name: `Season ${nextSeasonNumber}`,
        status: "active",
        startedAt: nowIso,
      };
      await db.create<Season>(COLLECTION, nextSeason);

      const usersToReset = users;
      const resetOps = usersToReset.map((user) =>
        db.update<User>("users", user.id, {
          ...user,
          points: 0,
          rank: 0,
          stats: {
            ...user.stats,
            totalPosts: 0,
            totalImpressions: 0,
            totalLikes: 0,
            totalRetweets: 0,
            xFollowers: 0,
            completedTasks: 0,
          },
        })
      );
      await Promise.all(resetOps);

      const submissions = await db.getCollection<Submission>("submissions");
      const approvedSubmissions = submissions.filter((submission) => submission.status === "approved");
      const approvedSubmissionIds = new Set(approvedSubmissions.map((submission) => submission.id));
      const removeApprovedOps = approvedSubmissions.map((submission) =>
        db.remove("submissions", submission.id)
      );
      await Promise.all(removeApprovedOps);

      const posts = await db.getCollection<{ id: string }>("ambassador_posts");
      const removePostOps = posts.map((post) => db.remove("ambassador_posts", post.id));
      await Promise.all(removePostOps);

      const remainingSubmissions = submissions.filter(
        (submission) => !approvedSubmissionIds.has(submission.id)
      );
      const taskSubmissionCounts = new Map<string, number>();
      for (const submission of remainingSubmissions) {
        taskSubmissionCounts.set(
          submission.taskId,
          (taskSubmissionCounts.get(submission.taskId) || 0) + 1
        );
      }

      const tasks = await db.getCollection<Task>("tasks");
      const updateTaskOps = tasks.map((task) =>
        db.update<Task>("tasks", task.id, {
          submissions: taskSubmissionCounts.get(task.id) || 0,
        })
      );
      await Promise.all(updateTaskOps);

      const closedSeasonWithSummary: Season = {
        ...closedSeason,
        resetUserCount: usersToReset.length,
      };
      await db.update<Season>(COLLECTION, currentSeason.id, closedSeasonWithSummary);

      return {
        closedSeason: closedSeasonWithSummary,
        newSeason: nextSeason,
        resetUserCount: usersToReset.length,
        resetApprovedSubmissions: approvedSubmissions.length,
      };
    }),
});
