import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { tasks as initialTasks, campaigns } from "@/mocks/data";
import { db } from "@/backend/db";
import type { Task, TaskStatus, Platform } from "@/types";
import { sendTaskActiveNotification } from "@/backend/services/telegram-notifications";

const COLLECTION = "tasks";
const MAX_IMAGE_DATA_URI_LENGTH = 300_000;
const ENABLE_DEFAULT_SEEDING = (process.env.ENABLE_DEFAULT_SEEDING || "false") === "true";

function validateTaskThumbnail(thumbnail?: string) {
  if (!thumbnail) return;
  if (thumbnail.startsWith("data:image/") && thumbnail.length > MAX_IMAGE_DATA_URI_LENGTH) {
    throw new Error("Task image is too large. Please use a smaller image.");
  }
}

async function ensureInitialized(): Promise<void> {
  const dbTasks = await db.getCollection<Task>(COLLECTION);
  if (dbTasks.length === 0 && ENABLE_DEFAULT_SEEDING) {
    console.log("[Tasks] No tasks in DB, initializing with defaults");
    for (const task of initialTasks) {
      await db.create(COLLECTION, task);
    }
  } else if (dbTasks.length === 0) {
    console.log("[Tasks] Collection empty, seeding disabled");
  }
}

let initPromise: Promise<void> | null = null;

async function getTasks(): Promise<Task[]> {
  if (!initPromise) {
    initPromise = ensureInitialized();
  }
  await initPromise;
  const tasks = await db.getCollection<Task>(COLLECTION);
  console.log("[Tasks] Read from DB, count:", tasks.length);
  return tasks;
}

export const tasksRouter = createTRPCRouter({
  list: publicProcedure.query(async () => {
    const tasks = await getTasks();
    console.log("[Tasks] Fetching all tasks, count:", tasks.length);
    return tasks;
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Tasks] Fetching task by id:", input.id);
      const tasks = await getTasks();
      const task = tasks.find((t) => t.id === input.id);
      if (!task) {
        throw new Error("Task not found");
      }
      return task;
    }),

  create: publicProcedure
    .input(
      z.object({
        campaignId: z.string(),
        campaignTitle: z.string().optional(),
        title: z.string(),
        brief: z.string(),
        thumbnail: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube", "facebook", "telegram"])),
        hashtags: z.array(z.string()),
        mentions: z.array(z.string()),
        dos: z.array(z.string()),
        donts: z.array(z.string()),
        deadline: z.string(),
        points: z.number(),
        maxSubmissions: z.number().optional(),
        requiredReferenceTweetUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateTaskThumbnail(input.thumbnail);
      const campaign = campaigns.find((c) => c.id === input.campaignId);
      const newTask: Task = {
        id: `task-${Date.now()}`,
        campaignId: input.campaignId,
        campaignTitle: input.campaignTitle || campaign?.title || "General Campaign",
        title: input.title,
        brief: input.brief,
        thumbnail: input.thumbnail,
        platforms: input.platforms as Platform[],
        hashtags: input.hashtags,
        mentions: input.mentions,
        dos: input.dos,
        donts: input.donts,
        deadline: input.deadline,
        points: input.points,
        status: "active" as TaskStatus,
        submissions: 0,
        maxSubmissions: input.maxSubmissions,
        requiredReferenceTweetUrl: input.requiredReferenceTweetUrl,
      };
      
      await db.create(COLLECTION, newTask);

      if (newTask.status === "active") {
        const result = await sendTaskActiveNotification(newTask);
        if (!result.sent) {
          console.log("[Tasks] Telegram task notification skipped/failed:", result.reason);
        }
      }
      
      console.log("[Tasks] Created new task:", newTask.id);
      return newTask;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        brief: z.string().optional(),
        thumbnail: z.string().optional(),
        platforms: z.array(z.enum(["twitter", "instagram", "tiktok", "youtube", "facebook", "telegram"])).optional(),
        hashtags: z.array(z.string()).optional(),
        mentions: z.array(z.string()).optional(),
        dos: z.array(z.string()).optional(),
        donts: z.array(z.string()).optional(),
        deadline: z.string().optional(),
        points: z.number().optional(),
        status: z.enum(["active", "upcoming", "completed"]).optional(),
        maxSubmissions: z.number().optional(),
        requiredReferenceTweetUrl: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      validateTaskThumbnail(input.thumbnail);
      const tasks = await getTasks();
      const existing = tasks.find((t) => t.id === input.id);
      if (!existing) {
        throw new Error("Task not found");
      }
      
      const updatedTask = { ...existing, ...input } as Task;
      await db.update(COLLECTION, input.id, updatedTask);

      const becameActive = existing.status !== "active" && updatedTask.status === "active";
      if (becameActive) {
        const result = await sendTaskActiveNotification(updatedTask);
        if (!result.sent) {
          console.log("[Tasks] Telegram task activation notification skipped/failed:", result.reason);
        }
      }
      
      console.log("[Tasks] Updated task:", input.id);
      return updatedTask;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const tasks = await getTasks();
      const existing = tasks.find((t) => t.id === input.id);
      if (!existing) {
        throw new Error("Task not found");
      }
      
      await db.remove(COLLECTION, input.id);
      
      console.log("[Tasks] Deleted task:", input.id);
      return { success: true };
    }),

  incrementSubmissions: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const tasks = await getTasks();
      const task = tasks.find((t) => t.id === input.id);
      if (!task) {
        return null;
      }
      
      const updatedTask = { ...task, submissions: task.submissions + 1 };
      await db.update(COLLECTION, input.id, updatedTask);
      
      console.log("[Tasks] Incremented submissions for task:", input.id, "to", updatedTask.submissions);
      return updatedTask;
    }),
});
