import { computeSeasonTaskCompletionRate } from "@/backend/services/admin-analytics";
import type { Submission, Task } from "@/types";

function makeTask(id: string, status: Task["status"] = "active"): Task {
  return {
    id,
    seasonId: "season-b",
    campaignId: "campaign-1",
    campaignTitle: "Campaign",
    title: `Task ${id}`,
    brief: "Brief",
    platforms: ["twitter"],
    hashtags: [],
    mentions: [],
    dos: [],
    donts: [],
    deadline: new Date().toISOString(),
    points: 100,
    status,
    submissions: 0,
  };
}

function makeSubmission(taskId: string, status: Submission["status"] = "approved"): Submission {
  return {
    id: `submission-${taskId}-${status}`,
    seasonId: "season-b",
    userId: "user-1",
    taskId,
    taskTitle: "Task",
    campaignTitle: "Campaign",
    platform: "twitter",
    postUrl: "https://x.com/example/status/1",
    status,
    submittedAt: new Date().toISOString(),
  };
}

function assertEqual(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`${label} failed: expected ${expected}, got ${actual}`);
  }
}

const seasonTasks: Task[] = [makeTask("t1"), makeTask("t2"), makeTask("t3")];

const afterResetRate = computeSeasonTaskCompletionRate({
  seasonTasks,
  seasonSubmissions: [],
  completionStatus: "approved",
});
assertEqual(afterResetRate, 0, "After reset rate");

const oneCompletedRate = computeSeasonTaskCompletionRate({
  seasonTasks,
  seasonSubmissions: [makeSubmission("t1", "approved")],
  completionStatus: "approved",
});
assertEqual(oneCompletedRate, 1 / 3, "One completed task rate");

console.log("admin-analytics verification passed");
console.log(`After reset: ${(afterResetRate * 100).toFixed(0)}%`);
console.log(`One completed in-season: ${(oneCompletedRate * 100).toFixed(0)}%`);
