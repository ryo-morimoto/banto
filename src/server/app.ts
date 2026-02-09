import { Elysia } from "elysia";
import { projectRoutes } from "./projects/routes.ts";
import { taskRoutes } from "./tasks/routes.ts";
import { sessionRoutes } from "./sessions/routes.ts";

export const app = new Elysia({ prefix: "/api" })
  .use(projectRoutes)
  .use(taskRoutes)
  .use(sessionRoutes);

export type App = typeof app;
