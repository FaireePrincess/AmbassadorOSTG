import app from "./hono";
import { startXMetricsScheduler } from "./services/x-metrics-tracker";
declare const Bun: { serve: (options: { port: number; fetch: typeof app.fetch }) => void };

const port = Number(process.env.PORT || 3000);

console.log(`[Backend] Starting server on 0.0.0.0:${port}`);
startXMetricsScheduler();

Bun.serve({
  port,
  fetch: app.fetch,
});
