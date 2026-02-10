import app from "./hono";

const port = Number(process.env.PORT || 3000);

console.log(`[Backend] Starting server on 0.0.0.0:${port}`);

Bun.serve({
  port,
  fetch: app.fetch,
});
