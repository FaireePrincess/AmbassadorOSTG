import app from "./hono";
import { startXMetricsScheduler } from "./services/x-metrics-tracker";
import { startEventReminderScheduler } from "./services/event-reminder-scheduler";
declare const Bun: { serve: (options: { port: number; fetch: typeof app.fetch }) => void };

const port = Number(process.env.PORT || 3000);

console.log(`[Backend] Starting server on 0.0.0.0:${port}`);
startXMetricsScheduler();
startEventReminderScheduler();

Bun.serve({
  port,
  fetch: app.fetch,
});
