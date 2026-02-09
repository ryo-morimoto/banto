import { Elysia, t } from "elysia";
import { db } from "../db.ts";
import { createProjectRepository } from "./repository.ts";
import { createProjectService } from "./service.ts";

const repo = createProjectRepository(db);
const service = createProjectService(repo);

export const projectRoutes = new Elysia({ prefix: "/projects" })
  .get("/", () => service.list())
  .post("/", ({ body }) => service.create(body), {
    body: t.Object({
      name: t.String(),
      localPath: t.String(),
      repoUrl: t.Optional(t.String()),
    }),
  })
  .delete("/:id", ({ params }) => {
    service.remove(params.id);
    return { ok: true };
  });
