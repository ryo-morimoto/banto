import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionService } from "./service.ts";
import type { TaskRepository } from "../tasks/repository.ts";
import type { ProjectRepository } from "../projects/repository.ts";
import type { AttachmentService } from "../attachments/service.ts";
import { runAgent } from "./agent.ts";
import { generateSlug } from "./slugify.ts";
import { getWorktreePath, createWorktree, removeWorktree } from "./worktree.ts";
import { logStore } from "./log-store.ts";
import { logger } from "../logger.ts";

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
  sessionService: SessionService,
  taskRepo: TaskRepository,
  projectRepo: ProjectRepository,
  attachmentService?: AttachmentService,
) {
  return {
    async run(sessionId: string) {
      const session = sessionService.findById(sessionId);
      if (!session || session.status !== "pending") return;

      const task = taskRepo.findById(session.taskId);
      if (!task) return;

      const project = projectRepo.findById(task.projectId);
      if (!project) return;

      const branch = `banto/${sessionId.slice(0, 8)}`;
      const containerName = `banto-${sessionId.slice(0, 8)}`;

      // Create isolated worktree
      const slug = await generateSlug(task.title);
      const wtPath = getWorktreePath(project.localPath, slug, sessionId);
      createWorktree(project.localPath, branch, wtPath);

      // Copy attachments into worktree
      const attachmentPaths = attachmentService
        ? copyAttachmentsToProject(attachmentService, task.id, wtPath)
        : [];

      // Transition to provisioning
      sessionService.markProvisioning(sessionId, containerName, wtPath);

      // Run agent asynchronously
      runAgent({
        bantoSessionId: sessionId,
        task,
        project,
        branch,
        attachmentPaths,
        cwd: wtPath,
        onSessionId: (ccSessionId) => {
          try {
            sessionService.markRunning(sessionId, ccSessionId, branch);
          } catch (err) {
            logger.warn("Session state transition failed", {
              sessionId,
              transition: "running",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
      })
        .then((result) => {
          try {
            if (result.success) {
              sessionService.markDone(sessionId);
            } else {
              sessionService.markFailed(sessionId, result.error ?? "Unknown error");
            }
          } catch (err) {
            logger.warn("Session state transition failed", {
              sessionId,
              transition: result.success ? "done" : "failed",
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
        .catch((err) => {
          try {
            sessionService.markFailed(sessionId, err instanceof Error ? err.message : String(err));
          } catch (innerErr) {
            logger.error("Failed to mark session as failed", {
              sessionId,
              error: innerErr instanceof Error ? innerErr.message : String(innerErr),
            });
          }
        })
        .finally(() => {
          try {
            removeWorktree(project.localPath, wtPath);
          } catch (err) {
            logger.warn("Failed to clean up worktree", {
              sessionId,
              worktreePath: wtPath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          // Clear log store after a grace period so SSE clients receive remaining logs
          setTimeout(() => logStore.clear(sessionId), 30_000);
        });
    },
  };
}

export function createMockRunner(sessionService: SessionService) {
  return {
    run(sessionId: string) {
      setTimeout(() => {
        try {
          sessionService.markProvisioning(
            sessionId,
            `banto-${sessionId.slice(0, 8)}`,
            "/mock/worktree",
          );
        } catch (err) {
          logger.warn("Mock: session state transition failed", {
            sessionId,
            transition: "provisioning",
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }

        setTimeout(() => {
          try {
            sessionService.markRunning(
              sessionId,
              `cc-${sessionId.slice(0, 8)}`,
              `task/${sessionId.slice(0, 8)}`,
            );
          } catch (err) {
            logger.warn("Mock: session state transition failed", {
              sessionId,
              transition: "running",
              error: err instanceof Error ? err.message : String(err),
            });
            return;
          }

          setTimeout(() => {
            try {
              if (Math.random() < 0.8) {
                sessionService.markDone(sessionId);
              } else {
                sessionService.markFailed(sessionId, "Mock: simulated failure");
              }
            } catch (err) {
              logger.warn("Mock: session state transition failed", {
                sessionId,
                transition: "done/failed",
                error: err instanceof Error ? err.message : String(err),
              });
              return;
            }
          }, 3000);
        }, 2000);
      }, 1000);
    },
  };
}

export type Runner = ReturnType<typeof createRunner>;
