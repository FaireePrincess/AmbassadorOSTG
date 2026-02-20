import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";
import { db } from "@/backend/db";
import {
  getAmbassadorDirectory,
  getProgramAnalytics,
  getRegionalActivityFeed,
  getRegionalAnalytics,
  getRegionalLeaderboard,
} from "@/backend/services/admin-analytics";
import { getXMetricsStatus, runXMetricsTrackingBatch } from "@/backend/services/x-metrics-tracker";
import type { User } from "@/types";

const USERS_COLLECTION = "users";

async function ensureAdmin(adminUserId: string) {
  const user = await db.getById<User>(USERS_COLLECTION, adminUserId);
  if (!user || user.role !== "admin" || user.status !== "active") {
    throw new Error("Admin access required");
  }
}

export const adminRouter = createTRPCRouter({
  analytics: publicProcedure
    .input(z.object({ adminUserId: z.string() }))
    .query(async ({ input }) => {
      await ensureAdmin(input.adminUserId);
      return getProgramAnalytics();
    }),

  analyticsRegions: publicProcedure
    .input(z.object({ adminUserId: z.string() }))
    .query(async ({ input }) => {
      await ensureAdmin(input.adminUserId);
      return getRegionalAnalytics();
    }),

  regionDashboard: publicProcedure
    .input(
      z.object({
        adminUserId: z.string(),
        region: z.string(),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .query(async ({ input }) => {
      await ensureAdmin(input.adminUserId);
      const [leaderboard, feed] = await Promise.all([
        getRegionalLeaderboard(input.region, input.limit || 20),
        getRegionalActivityFeed(input.region, input.limit || 20),
      ]);

      return {
        region: input.region,
        leaderboard,
        activityFeed: feed,
      };
    }),

  ambassadorDirectory: publicProcedure.query(async () => {
    return getAmbassadorDirectory();
  }),

  runXMetricsNow: publicProcedure
    .input(z.object({ adminUserId: z.string(), region: z.string().optional() }))
    .mutation(async ({ input }) => {
      await ensureAdmin(input.adminUserId);
      return runXMetricsTrackingBatch("manual-admin", input.region);
    }),

  xMetricsStatus: publicProcedure
    .input(z.object({ adminUserId: z.string() }))
    .query(async ({ input }) => {
      await ensureAdmin(input.adminUserId);
      return getXMetricsStatus();
    }),
});
