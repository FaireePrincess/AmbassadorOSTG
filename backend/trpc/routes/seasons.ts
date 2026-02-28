import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { db } from "@/backend/db";
import { ensureActiveSeason, isSubmissionInSeason, isTaskInSeason, listSeasons, setCurrentSeasonConfig } from "@/backend/services/season";
import type { Season, SeasonResetLog, Submission, Task, User } from "@/types";

const COLLECTION = "seasons";
const RESET_LOGS_COLLECTION = "season_resets";

async function backfillActiveTasksToCurrentSeason(currentSeason: Season): Promise<number> {
  const tasks = await db.getCollection<Task>("tasks");
  const toBackfill = tasks.filter(
    (task) => !task.seasonId && (task.status === "active" || task.status === "upcoming")
  );

  if (toBackfill.length === 0) return 0;

  await Promise.all(
    toBackfill.map((task) =>
      db.update<Task>("tasks", task.id, {
        ...task,
        seasonId: currentSeason.id,
      })
    )
  );
  return toBackfill.length;
}

async function validateResetReadiness(currentSeason: Season): Promise<{ ok: boolean; reasons: string[] }> {
  const [tasks, submissions] = await Promise.all([
    db.getCollection<Task>("tasks"),
    db.getCollection<Submission>("submissions"),
  ]);

  const reasons: string[] = [];

  const activeTasks = tasks.filter((task) => task.status === "active" || task.status === "upcoming");
  const tasksSeasonScoped = activeTasks.every((task) => isTaskInSeason(task, currentSeason));
  if (!tasksSeasonScoped) {
    reasons.push("tasks are not season-scoped");
  }

  const submissionsSeasonScoped = submissions.every((submission) => {
    if (submission.seasonId) return true;
    const ts = Date.parse(submission.submittedAt || "");
    return !Number.isNaN(ts);
  });
  if (!submissionsSeasonScoped) {
    reasons.push("submissions are not season-scoped");
  }

  // Approved counters and profile/leaderboard are season-scoped when current season submissions
  // can be deterministically derived (seasonId or timestamp fallback).
  const hasDeterministicSeasonFilter = submissions.every(
    (submission) => Boolean(submission.seasonId) || !Number.isNaN(Date.parse(submission.submittedAt || ""))
  );
  if (!hasDeterministicSeasonFilter) {
    reasons.push("approved count/profile/leaderboard cannot be season-filtered safely");
  }

  return { ok: reasons.length === 0, reasons };
}

export const seasonsRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    await ensureActiveSeason();
    return listSeasons();
  }),

  getCurrent: publicProcedure.query(async () => {
    return ensureActiveSeason();
  }),

  closeAndStartNew: publicProcedure
    .input(
      z.object({
        adminUserId: z.string(),
        nextSeasonName: z.string().min(1).optional(),
        nextSeasonNumber: z.number().int().min(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const users = await db.getCollection<User>("users");
      const admin = users.find((user) => user.id === input.adminUserId);
      if (!admin || admin.role !== "admin" || admin.status !== "active") {
        throw new Error("Only an active admin can close a season.");
      }

      const currentSeason = await ensureActiveSeason();
      await backfillActiveTasksToCurrentSeason(currentSeason);
      const readiness = await validateResetReadiness(currentSeason);
      if (!readiness.ok) {
        throw new Error(`Season reset blocked: ${readiness.reasons.join("; ")}`);
      }

      const nowIso = new Date().toISOString();
      const closedSeason: Season = {
        ...currentSeason,
        status: "closed",
        endedAt: nowIso,
        closedByUserId: admin.id,
        closedByName: admin.name,
      };
      await db.update<Season>(COLLECTION, currentSeason.id, closedSeason);

      const nextSeasonNumber = input.nextSeasonNumber ?? (currentSeason.number + 1);
      const nextSeason: Season = {
        id: `season-${nextSeasonNumber}-${Date.now()}`,
        number: nextSeasonNumber,
        name: input.nextSeasonName || `Season ${nextSeasonNumber}`,
        status: "active",
        startedAt: nowIso,
      };
      await db.create<Season>(COLLECTION, nextSeason);
      await setCurrentSeasonConfig(nextSeason.id);

      const usersToReset = users;
      const resetOps = usersToReset.map((user) =>
        db.update<User>("users", user.id, {
          ...user,
          season_points: 0,
          season_rank: null,
          season_submission_count: 0,
          season_approved_count: 0,
        })
      );
      await Promise.all(resetOps);

      const tasks = await db.getCollection<Task>("tasks");
      const archiveTaskOps = tasks
        .filter((task) => isTaskInSeason(task, currentSeason))
        .map((task) =>
          db.update<Task>("tasks", task.id, {
            ...task,
            seasonId: task.seasonId || currentSeason.id,
            status: "completed",
          })
        );
      await Promise.all(archiveTaskOps);

      const submissions = await db.getCollection<Submission>("submissions");
      const currentSeasonApproved = submissions.filter(
        (submission) => submission.status === "approved" && isSubmissionInSeason(submission, currentSeason)
      );

      const closedSeasonWithSummary: Season = {
        ...closedSeason,
        resetUserCount: usersToReset.length,
      };
      await db.update<Season>(COLLECTION, currentSeason.id, closedSeasonWithSummary);

      const resetLog: SeasonResetLog = {
        id: `season-reset-${Date.now()}`,
        createdByAdmin: admin.id,
        previousSeasonId: currentSeason.id,
        newSeasonId: nextSeason.id,
        createdAt: nowIso,
      };
      await db.create<SeasonResetLog>(RESET_LOGS_COLLECTION, resetLog);

      return {
        closedSeason: closedSeasonWithSummary,
        newSeason: nextSeason,
        resetUserCount: usersToReset.length,
        resetApprovedSubmissions: currentSeasonApproved.length,
      };
    }),
});
