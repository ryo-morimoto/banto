import { Elysia, t } from "elysia";
import { db } from "../db.ts";
import { createTaskRepository } from "./repository.ts";
import { createTaskService } from "./service.ts";
import { readArtifacts } from "./artifacts.ts";

const repo = createTaskRepository(db);
const service = createTaskService(repo);

export const taskRoutes = new Elysia({ prefix: "/tasks" })
  .get("/active", () => service.listActive())
  .get("/backlog", () => service.listBacklog())
  .get("/pinned", () => service.listPinned())
  .get("/project/:projectId", ({ params }) => service.listByProject(params.projectId))
  .get("/:id", ({ params }) => {
    const task = repo.findById(params.id);
    if (!task) throw new Error("Task not found");
    return task;
  })
  .post("/", ({ body }) => service.create(body), {
    body: t.Object({
      projectId: t.String(),
      title: t.String(),
      description: t.Optional(t.String()),
    }),
  })
  .post("/:id/activate", ({ params }) => service.activate(params.id))
  .post("/:id/complete", ({ params }) => service.complete(params.id))
  .post("/:id/reopen", ({ params }) => service.reopen(params.id))
  .post("/:id/pin", ({ params }) => service.pin(params.id))
  .post("/:id/unpin", ({ params }) => service.unpin(params.id))
  .patch(
    "/:id/description",
    ({ params, body }) => service.updateDescription(params.id, body.description),
    {
      body: t.Object({
        description: t.String(),
      }),
    },
  )
  .post(
    "/:id/link-change",
    ({ params, body }) => service.linkChange(params.id, body.changeId),
    {
      body: t.Object({
        changeId: t.String(),
      }),
    },
  )
  .post("/:id/unlink-change", ({ params }) => service.unlinkChange(params.id))
  .get("/:id/artifacts", async ({ params }) => {
    const task = repo.findById(params.id);
    if (!task) throw new Error("Task not found");
    if (!task.changeId || !task.worktreePath)
      return { proposal: null, design: null, tasks: null };
    return readArtifacts(task.worktreePath, task.changeId);
  });
