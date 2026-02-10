import { createTRPCRouter } from "./create-context";
import { tasksRouter } from "./routes/tasks";
import { eventsRouter } from "./routes/events";
import { assetsRouter } from "./routes/assets";
import { submissionsRouter } from "./routes/submissions";
import { usersRouter } from "./routes/users";
import { twitterRouter } from "./routes/twitter";

export const appRouter = createTRPCRouter({
  tasks: tasksRouter,
  events: eventsRouter,
  assets: assetsRouter,
  submissions: submissionsRouter,
  users: usersRouter,
  twitter: twitterRouter,
});

export type AppRouter = typeof appRouter;
