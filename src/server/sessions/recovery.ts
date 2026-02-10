import type { SessionRepository } from "./repository.ts";
import type { TaskRepository } from "../tasks/repository.ts";
import type { ProjectRepository } from "../projects/repository.ts";
import { logger } from "../logger.ts";

export function recoverStaleSessions(
  sessionRepo: SessionRepository,
  taskRepo: TaskRepository,
  projectRepo: ProjectRepository,
  removeWorktreeFn: (repoPath: string, destPath: string) => void,
): void {
  const active = sessionRepo.findActive();

  for (const session of active) {
    // Clean up worktree if it exists
    if (session.status !== "pending" && "worktreePath" in session && session.worktreePath) {
      const task = taskRepo.findById(session.taskId);
      const project = task ? projectRepo.findById(task.projectId) : null;

      if (project) {
        try {
          removeWorktreeFn(project.localPath, session.worktreePath);
        } catch (err) {
          logger.warn("Failed to clean up worktree during recovery", {
            sessionId: session.id,
            worktreePath: session.worktreePath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Mark session as failed
    sessionRepo.updateStatus(session.id, "failed", {
      error: "Server restarted",
      completed_at: new Date().toISOString(),
    });
  }
}
