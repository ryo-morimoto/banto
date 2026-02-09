import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionService } from "./service.ts";
import type { TaskRepository } from "../tasks/repository.ts";
import type { ProjectRepository } from "../projects/repository.ts";
import type { AttachmentService } from "../attachments/service.ts";
import { runAgent } from "./agent.ts";

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
    run(sessionId: string) {
      const session = sessionService.findById(sessionId);
      if (!session || session.status !== "pending") return;

      const task = taskRepo.findById(session.taskId);
      if (!task) return;

      const project = projectRepo.findById(task.projectId);
      if (!project) return;

      const branch = `banto/${sessionId.slice(0, 8)}`;
      const containerName = `banto-${sessionId.slice(0, 8)}`;

      // Copy attachments into project working directory
      const attachmentPaths = attachmentService
        ? copyAttachmentsToProject(attachmentService, task.id, project.localPath)
        : [];

      // Transition to provisioning
      sessionService.markProvisioning(sessionId, containerName);

      // Run agent asynchronously
      runAgent({
        bantoSessionId: sessionId,
        task,
        project,
        branch,
        attachmentPaths,
        onSessionId: (ccSessionId) => {
          try {
            sessionService.markRunning(sessionId, ccSessionId, branch);
          } catch {
            // Session may already be in a different state
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
          } catch {
            // Session may already be in a terminal state
          }
        })
        .catch((err) => {
          try {
            sessionService.markFailed(sessionId, err instanceof Error ? err.message : String(err));
          } catch {
            // ignore
          }
        });
    },
  };
}

export function createMockRunner(sessionService: SessionService) {
  return {
    run(sessionId: string) {
      setTimeout(() => {
        try {
          sessionService.markProvisioning(sessionId, `banto-${sessionId.slice(0, 8)}`);
        } catch {
          return;
        }

        setTimeout(() => {
          try {
            sessionService.markRunning(
              sessionId,
              `cc-${sessionId.slice(0, 8)}`,
              `task/${sessionId.slice(0, 8)}`,
            );
          } catch {
            return;
          }

          setTimeout(() => {
            try {
              if (Math.random() < 0.8) {
                sessionService.markDone(sessionId);
              } else {
                sessionService.markFailed(sessionId, "Mock: simulated failure");
              }
            } catch {
              return;
            }
          }, 3000);
        }, 2000);
      }, 1000);
    },
  };
}

export type Runner = ReturnType<typeof createRunner>;
