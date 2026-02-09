import { Elysia, t } from "elysia";
import { db } from "../db.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createProjectRepository } from "../projects/repository.ts";
import { createSessionRepository } from "./repository.ts";
import { createSessionService } from "./service.ts";
import { createRunner, createMockRunner } from "./runner.ts";
import { logStore } from "./log-store.ts";
import { attachmentService } from "../attachments/routes.ts";

const taskRepo = createTaskRepository(db);
const projectRepo = createProjectRepository(db);
const sessionRepo = createSessionRepository(db);
const service = createSessionService(sessionRepo, taskRepo);

const runner =
  process.env["BANTO_MOCK_RUNNER"] === "1"
    ? createMockRunner(service)
    : createRunner(service, taskRepo, projectRepo, attachmentService);

export const sessionRoutes = new Elysia({ prefix: "/sessions" })
  .get("/task/:taskId", ({ params }) => service.findByTaskId(params.taskId))
  .get("/:id", ({ params }) => {
    const session = service.findById(params.id);
    if (!session) throw new Error("Session not found");
    return session;
  })
  .post(
    "/",
    ({ body }) => {
      const session = service.start(body.taskId);
      runner.run(session.id);
      return session;
    },
    {
      body: t.Object({
        taskId: t.String(),
      }),
    },
  )
  .post(
    "/:id/provisioning",
    ({ params, body }) => service.markProvisioning(params.id, body.containerName),
    {
      body: t.Object({
        containerName: t.String(),
      }),
    },
  )
  .post(
    "/:id/running",
    ({ params, body }) => service.markRunning(params.id, body.ccSessionId, body.branch),
    {
      body: t.Object({
        ccSessionId: t.String(),
        branch: t.String(),
      }),
    },
  )
  .post("/:id/done", ({ params }) => service.markDone(params.id))
  .post("/:id/failed", ({ params, body }) => service.markFailed(params.id, body.error), {
    body: t.Object({
      error: t.String(),
    }),
  })
  .get("/:id/logs", ({ params }) => logStore.getAll(params.id))
  .get("/:id/logs/stream", ({ params }) => {
    const sessionId = params.id;
    return new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();

          // Send existing logs first
          for (const entry of logStore.getAll(sessionId)) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
          }

          // Subscribe to new logs
          const unsubscribe = logStore.subscribe(sessionId, (entry) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(entry)}\n\n`));
            } catch {
              unsubscribe();
            }
          });

          // Clean up on close
          const checkClosed = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(":\n\n"));
            } catch {
              unsubscribe();
              clearInterval(checkClosed);
            }
          }, 15000);
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  });
