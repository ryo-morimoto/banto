import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import type { Task } from "../../shared/types.ts";
import type { TaskRepository } from "../tasks/repository.ts";
import type { ProjectRepository } from "../projects/repository.ts";
import type { SessionLogRepository } from "../session-logs/repository.ts";
import type { AttachmentService } from "../attachments/service.ts";
import { generateSlug } from "./slugify.ts";
import { getWorktreePath, createWorktree, removeWorktree } from "./worktree.ts";
import { ptyStore } from "./pty-store.ts";
import { logger } from "../logger.ts";

interface PtyProcess {
  proc: ReturnType<typeof Bun.spawn>;
  terminal: Bun.Terminal;
}

const activePtys = new Map<string, PtyProcess>();

function copyAttachmentsToProject(
  attachmentService: AttachmentService,
  taskId: string,
  projectPath: string,
): string[] {
  const attachments = attachmentService.listByTaskId(taskId);
  if (attachments.length === 0) return [];

  const destDir = join(projectPath, ".banto", "attachments");
  mkdirSync(destDir, { recursive: true });

  const paths: string[] = [];
  for (const attachment of attachments) {
    const srcPath = attachmentService.getFilePath(attachment.id);
    if (!srcPath) continue;
    const destPath = join(destDir, attachment.filename);
    copyFileSync(srcPath, destPath);
    paths.push(destPath);
  }
  return paths;
}

export function createRunner(
  db: Database,
  taskRepo: TaskRepository,
  projectRepo: ProjectRepository,
  sessionLogRepo: SessionLogRepository,
  attachmentService?: AttachmentService,
) {
  return {
    startSession(taskId: string): Task {
      // Race-safe guard: BEGIN IMMEDIATE + null check
      const tx = db.transaction(() => {
        const task = taskRepo.findById(taskId);
        if (!task) throw new Error("Task not found");
        if (task.status !== "active")
          throw new Error(`Cannot start session for task in ${task.status} status`);
        if (task.sessionStatus !== null) throw new Error("Task already has an active session");

        return taskRepo.updateSessionStatus(taskId, "pending", {
          sessionStartedAt: new Date().toISOString(),
          sessionError: null,
          worktreePath: null,
          branch: null,
        });
      });

      const task = tx.immediate();
      this.spawnPty(task).catch((err) => {
        logger.error("Unhandled error in spawnPty", {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return task;
    },

    async spawnPty(task: Task) {
      const endSessionTimer = logger.startTimer();
      const project = projectRepo.findById(task.projectId);
      if (!project) {
        taskRepo.updateSessionStatus(task.id, "failed", {
          sessionError: "Project not found",
        });
        return;
      }

      const slug = await generateSlug(task.title);
      const branch = `banto/${task.id.slice(0, 8)}`;
      const wtPath = getWorktreePath(project.localPath, slug, task.id);

      try {
        createWorktree(project.localPath, branch, wtPath);
      } catch (err) {
        taskRepo.updateSessionStatus(task.id, "failed", {
          sessionError: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      // Copy attachments into worktree
      if (attachmentService) {
        copyAttachmentsToProject(attachmentService, task.id, wtPath);
      }

      taskRepo.updateSessionStatus(task.id, "provisioning", {
        worktreePath: wtPath,
        branch,
      });

      const prompt = [task.title, task.description].filter(Boolean).join("\n\n");
      let firstData = true;

      const terminal = new Bun.Terminal({
        cols: 120,
        rows: 40,
        data(_term: unknown, data: Uint8Array) {
          ptyStore.push(task.id, data);

          if (firstData) {
            firstData = false;
            try {
              taskRepo.updateSessionStatus(task.id, "running");
            } catch (err) {
              logger.warn("Failed to transition to running", {
                taskId: task.id,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        },
        exit() {
          activePtys.delete(task.id);
        },
      });

      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(["claude", prompt], {
          cwd: wtPath,
          env: { ...process.env, CLAUDE_CODE_EXECUTABLE: undefined },
          terminal,
        });
      } catch (err) {
        taskRepo.updateSessionStatus(task.id, "failed", {
          sessionError: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      activePtys.set(task.id, { proc, terminal });

      ptyStore.setStdinWriter(task.id, (data: string) => {
        terminal.write(data);
      });

      // Wait for process exit
      proc.exited
        .then((exitCode: number) => {
          try {
            if (exitCode === 0) {
              taskRepo.updateSessionStatus(task.id, "done");
              endSessionTimer("info", "Session completed", {
                taskId: task.id,
                exitCode,
              });
            } else {
              taskRepo.updateSessionStatus(task.id, "failed", {
                sessionError: `Process exited with code ${exitCode}`,
              });
              endSessionTimer("warn", "Session failed", {
                taskId: task.id,
                exitCode,
              });
            }
          } catch (err) {
            logger.warn("Failed to update session status on exit", {
              taskId: task.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          ptyStore.notifyEnd(task.id);
        })
        .catch((err: unknown) => {
          try {
            taskRepo.updateSessionStatus(task.id, "failed", {
              sessionError: err instanceof Error ? err.message : String(err),
            });
          } catch (innerErr) {
            logger.error("Failed to mark session as failed", {
              taskId: task.id,
              error: innerErr instanceof Error ? innerErr.message : String(innerErr),
            });
          }
          endSessionTimer("error", "Session crashed", {
            taskId: task.id,
            error: err instanceof Error ? err.message : String(err),
          });
          ptyStore.notifyEnd(task.id);
        });
    },

    archiveSession(taskId: string) {
      const task = taskRepo.findById(taskId);
      if (!task || task.sessionStatus === null) return;

      // 1. Kill PTY if alive
      const pty = activePtys.get(taskId);
      if (pty) {
        try {
          pty.proc.kill("SIGTERM");
          // Give a short grace period then force kill
          setTimeout(() => {
            try {
              pty.proc.kill("SIGKILL");
            } catch {}
          }, 3000);
        } catch {}
        activePtys.delete(taskId);
      }

      // 2. Clear ptyStore
      ptyStore.clear(taskId);

      // 3. Archive + reset in transaction
      const tx = db.transaction(() => {
        const current = taskRepo.findById(taskId);
        if (!current || current.sessionStatus === null) return;

        sessionLogRepo.insert({
          id: crypto.randomUUID(),
          taskId,
          startedAt: current.sessionStartedAt ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          exitStatus: current.sessionStatus === "done" ? "done" : "failed",
          error: current.sessionError,
        });

        taskRepo.resetSessionFields(taskId);
      });
      tx.immediate();

      // 4. Clean up worktree
      if (task.worktreePath) {
        const project = projectRepo.findById(task.projectId);
        if (project) {
          try {
            removeWorktree(project.localPath, task.worktreePath, task.branch ?? undefined);
          } catch (err) {
            logger.warn("Failed to clean up worktree", {
              taskId,
              worktreePath: task.worktreePath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    },

    retrySession(taskId: string): Task {
      this.archiveSession(taskId);
      return this.startSession(taskId);
    },

    resizeTerminal(taskId: string, cols: number, rows: number) {
      const pty = activePtys.get(taskId);
      if (!pty) throw new Error("Active PTY not found for this task");
      pty.terminal.resize(cols, rows);
    },

    getActivePty(taskId: string): PtyProcess | undefined {
      return activePtys.get(taskId);
    },
  };
}

export type Runner = ReturnType<typeof createRunner>;
