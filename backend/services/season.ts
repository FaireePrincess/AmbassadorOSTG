import { db } from "@/backend/db";
import type { Season, Submission, Task } from "@/types";

const SEASONS_COLLECTION = "seasons";
const SYSTEM_CONFIG_COLLECTION = "system_config";
const CURRENT_SEASON_CONFIG_ID = "current_season";

type SystemConfigRecord = {
  id: string;
  currentSeasonId: string;
  updatedAt: string;
};

function sortByNumberDesc(seasons: Season[]): Season[] {
  return [...seasons].sort((a, b) => b.number - a.number);
}

export async function listSeasons(): Promise<Season[]> {
  const seasons = await db.getCollection<Season>(SEASONS_COLLECTION);
  return sortByNumberDesc(seasons);
}

export async function ensureActiveSeason(): Promise<Season> {
  const seasons = await listSeasons();
  const config = await db.getById<SystemConfigRecord>(SYSTEM_CONFIG_COLLECTION, CURRENT_SEASON_CONFIG_ID);
  if (config?.currentSeasonId) {
    const configured = seasons.find((season) => season.id === config.currentSeasonId);
    if (configured && configured.status === "active") {
      return configured;
    }
  }

  const active = seasons.find((season) => season.status === "active");
  if (active) {
    await setCurrentSeasonConfig(active.id);
    return active;
  }

  const maxNumber = seasons.length > 0 ? Math.max(...seasons.map((season) => season.number)) : 0;
  const nextNumber = maxNumber + 1;
  const nowIso = new Date().toISOString();
  const season: Season = {
    id: `season-${nextNumber}-${Date.now()}`,
    number: nextNumber,
    name: `Season ${nextNumber}`,
    status: "active",
    startedAt: nowIso,
  };
  await db.create<Season>(SEASONS_COLLECTION, season);
  await setCurrentSeasonConfig(season.id);
  return season;
}

export async function setCurrentSeasonConfig(seasonId: string): Promise<void> {
  const payload: SystemConfigRecord = {
    id: CURRENT_SEASON_CONFIG_ID,
    currentSeasonId: seasonId,
    updatedAt: new Date().toISOString(),
  };
  await db.upsert<SystemConfigRecord>(SYSTEM_CONFIG_COLLECTION, payload);
}

function parseTs(value?: string): number | null {
  const ts = Date.parse(value || "");
  return Number.isNaN(ts) ? null : ts;
}

export function isSubmissionInSeason(submission: Submission, season: Season): boolean {
  if (submission.seasonId) {
    return submission.seasonId === season.id;
  }

  const submittedTs = parseTs(submission.submittedAt);
  const seasonStartTs = parseTs(season.startedAt);
  const seasonEndTs = parseTs(season.endedAt);
  if (submittedTs === null || seasonStartTs === null) return false;
  if (submittedTs < seasonStartTs) return false;
  if (seasonEndTs !== null && submittedTs >= seasonEndTs) return false;
  return true;
}

export function isTaskInSeason(task: Task, season: Season): boolean {
  if (task.seasonId) return task.seasonId === season.id;
  // Legacy fallback before first explicit season assignment.
  return season.number === 1;
}
