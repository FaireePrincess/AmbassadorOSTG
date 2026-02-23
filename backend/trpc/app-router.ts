import { createTRPCRouter } from "./create-context";
import { tasksRouter } from "./routes/tasks";
import { eventsRouter } from "./routes/events";
import { assetsRouter } from "./routes/assets";
import { submissionsRouter } from "./routes/submissions";
import { usersRouter } from "./routes/users";
import { twitterRouter } from "./routes/twitter";
import { seasonsRouter } from "./routes/seasons";
import { adminRouter } from "./routes/admin";
import { pollsRouter } from "./routes/polls";
import { newsRouter } from "./routes/news";

export const appRouter = createTRPCRouter({
  tasks: tasksRouter,
  events: eventsRouter,
  assets: assetsRouter,
  submissions: submissionsRouter,
  users: usersRouter,
  twitter: twitterRouter,
  seasons: seasonsRouter,
  admin: adminRouter,
  polls: pollsRouter,
  news: newsRouter,
});

export type AppRouter = typeof appRouter;
