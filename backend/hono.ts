import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { getStorageDiagnostics } from "./db";
import { db } from "./db";
import type { User } from "@/types";
import { getProgramAnalytics, getRegionalAnalytics } from "./services/admin-analytics";

const app = new Hono();

console.log('[Backend] Starting Ambassador OS API...');

app.use("*", cors());

app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "Ambassador OS API is running" });
});

app.get("/debug/storage", async (c) => {
  const diagnostics = await getStorageDiagnostics();
  return c.json({ status: "ok", diagnostics });
});

app.get("/admin/analytics", async (c) => {
  const adminUserId = c.req.query("adminUserId");
  if (!adminUserId) {
    return c.json({ error: "adminUserId is required" }, 400);
  }

  const user = await db.getById<User>("users", adminUserId);
  if (!user || user.role !== "admin" || user.status !== "active") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const data = await getProgramAnalytics();
  return c.json(data);
});

app.get("/admin/analytics/regions", async (c) => {
  const adminUserId = c.req.query("adminUserId");
  if (!adminUserId) {
    return c.json({ error: "adminUserId is required" }, 400);
  }

  const user = await db.getById<User>("users", adminUserId);
  if (!user || user.role !== "admin" || user.status !== "active") {
    return c.json({ error: "Admin access required" }, 403);
  }

  const data = await getRegionalAnalytics();
  return c.json(data);
});

export default app;
