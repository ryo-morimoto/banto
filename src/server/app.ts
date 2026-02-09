import { Elysia } from "elysia";
import { projectRoutes } from "./projects/routes.ts";
import { taskRoutes } from "./tasks/routes.ts";
import { sessionRoutes } from "./sessions/routes.ts";
import { attachmentRoutes } from "./attachments/routes.ts";

export const app = new Elysia({ prefix: "/api" })
  .use(projectRoutes)
  .use(taskRoutes)
  .use(sessionRoutes)
  .use(attachmentRoutes);

export type App = typeof app;
