import type { TaskRepository } from "../tasks/repository.ts";
import type { ProjectRepository } from "../projects/repository.ts";
import type { SessionLogRepository } from "../session-logs/repository.ts";
import { logger } from "../logger.ts";

export function recoverOrphanedSessions(
  taskRepo: TaskRepository,
  projectRepo: ProjectRepository,
  sessionLogRepo: SessionLogRepository,
  removeWorktreeFn: (repoPath: string, destPath: string) => void,
): void {
  const orphaned = taskRepo.findWithActiveSession();

  for (const task of orphaned) {
    // Clean up worktree if it exists
    if (task.worktreePath) {
      const project = projectRepo.findById(task.projectId);
      if (project) {
        try {
          removeWorktreeFn(project.localPath, task.worktreePath);
        } catch (err) {
          logger.warn("Failed to clean up worktree during recovery", {
            taskId: task.id,
            worktreePath: task.worktreePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Archive to session_logs
    sessionLogRepo.insert({
      id: crypto.randomUUID(),
      taskId: task.id,
      startedAt: task.sessionStartedAt ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      exitStatus: "failed",
      error: "server restart",
    });

    // Reset session fields
    taskRepo.resetSessionFields(task.id);

    logger.info("Recovered orphaned session", { taskId: task.id });
  }
}
