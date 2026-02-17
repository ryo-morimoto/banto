import { Elysia, t } from "elysia";
import { db } from "../db.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createProjectRepository } from "../projects/repository.ts";
import { createSessionLogRepository } from "../session-logs/repository.ts";
import { createRunner } from "./runner.ts";
import { recoverOrphanedSessions } from "./recovery.ts";
import { removeWorktree } from "./worktree.ts";
import { ptyStore } from "./pty-store.ts";
import { attachmentService } from "../attachments/instance.ts";

const taskRepo = createTaskRepository(db);
const projectRepo = createProjectRepository(db);
const sessionLogRepo = createSessionLogRepository(db);
const terminalUnsubscribers = new WeakMap<object, () => void>();
const terminalDecoder = new TextDecoder();

function decodeTerminalInput(message: unknown): string | null {
  if (typeof message === "string") return message;
  if (message instanceof Uint8Array) return terminalDecoder.decode(message);
  if (message instanceof ArrayBuffer) return terminalDecoder.decode(new Uint8Array(message));
  return null;
}

// Recover orphaned sessions before accepting requests
recoverOrphanedSessions(taskRepo, projectRepo, sessionLogRepo, removeWorktree);

const runner = createRunner(db, taskRepo, projectRepo, sessionLogRepo, attachmentService);

export const sessionRoutes = new Elysia()
  .post("/tasks/:id/session/start", ({ params }) => {
    return runner.startSession(params.id);
  })
  .post("/tasks/:id/session/retry", ({ params }) => {
    return runner.retrySession(params.id);
  })
  .post(
    "/tasks/:id/terminal/resize",
    ({ params, body }) => {
      runner.resizeTerminal(params.id, body.cols, body.rows);
      return { ok: true };
    },
    {
      body: t.Object({
        cols: t.Number(),
        rows: t.Number(),
      }),
    },
  )
  .get("/tasks/:id/session-logs", ({ params }) => {
    return sessionLogRepo.findByTaskId(params.id);
  })
  .ws("/tasks/:id/terminal", {
    open(ws) {
      const taskId = ws.data.params.id;
      const task = taskRepo.findById(taskId);

      if (!task || task.sessionStatus === null) {
        ws.close(4404, "No active session");
        return;
      }

      // Send replay buffer
      const buffer = ptyStore.getBuffer(taskId);
      for (const chunk of buffer) {
        ws.sendBinary(chunk);
      }

      // Subscribe to live output
      const unsubData = ptyStore.subscribe(taskId, (data) => {
        ws.sendBinary(data);
      });

      // Close WebSocket when session ends
      const unsubEnd = ptyStore.onEnd(taskId, () => {
        ws.close(1000, "Session ended");
      });

      // Store cleanup for both subscriptions
      terminalUnsubscribers.set(ws, () => {
        unsubData();
        unsubEnd();
      });
    },
    message(ws, message) {
      const taskId = ws.data.params.id;
      const task = taskRepo.findById(taskId);

      // Only forward stdin for active sessions
      if (
        task &&
        task.sessionStatus !== null &&
        task.sessionStatus !== "done" &&
        task.sessionStatus !== "failed"
      ) {
        const data = decodeTerminalInput(message);
        if (data !== null) {
          ptyStore.writeStdin(taskId, data);
        }
      }
    },
    close(ws) {
      const unsubscribe = terminalUnsubscribers.get(ws);
      if (unsubscribe) unsubscribe();
      terminalUnsubscribers.delete(ws);
    },
    params: t.Object({
      id: t.String(),
    }),
  });
