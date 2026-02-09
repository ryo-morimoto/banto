import type { SessionService } from "./service.ts";
import type { TaskRepository } from "../tasks/repository.ts";
import type { ProjectRepository } from "../projects/repository.ts";
import { runAgent } from "./agent.ts";

export function createRunner(
  sessionService: SessionService,
  taskRepo: TaskRepository,
  projectRepo: ProjectRepository,
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

      // Transition to provisioning
      sessionService.markProvisioning(sessionId, containerName);

      // Run agent asynchronously
      runAgent({
        bantoSessionId: sessionId,
        task,
        project,
        branch,
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
