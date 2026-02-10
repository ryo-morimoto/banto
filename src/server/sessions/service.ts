import type { SessionRepository } from "./repository.ts";
import type { TaskRepository } from "../tasks/repository.ts";

export function createSessionService(sessionRepo: SessionRepository, taskRepo: TaskRepository) {
  return {
    start(taskId: string) {
      const task = taskRepo.findById(taskId);
      if (!task) throw new Error("Task not found");
      if (task.status !== "active")
        throw new Error(`Cannot start session for task in ${task.status} status`);

      const active = sessionRepo.findActiveByTaskId(taskId);
      if (active) throw new Error("Task already has an active session");

      const id = crypto.randomUUID();
      sessionRepo.insert({ id, taskId });
      return sessionRepo.findById(id)!;
    },

    markProvisioning(id: string, containerName: string, worktreePath: string) {
      const session = sessionRepo.findById(id);
      if (!session) throw new Error("Session not found");
      if (session.status !== "pending")
        throw new Error(`Cannot provision session in ${session.status} status`);
      sessionRepo.updateStatus(id, "provisioning", {
        container_name: containerName,
        worktree_path: worktreePath,
      });
      return sessionRepo.findById(id)!;
    },

    markRunning(id: string, ccSessionId: string, branch: string) {
      const session = sessionRepo.findById(id);
      if (!session) throw new Error("Session not found");
      if (session.status !== "provisioning")
        throw new Error(`Cannot mark running session in ${session.status} status`);
      sessionRepo.updateStatus(id, "running", { cc_session_id: ccSessionId, branch });
      return sessionRepo.findById(id)!;
    },

    markDone(id: string) {
      const session = sessionRepo.findById(id);
      if (!session) throw new Error("Session not found");
      if (session.status !== "running")
        throw new Error(`Cannot complete session in ${session.status} status`);
      sessionRepo.updateStatus(id, "done", { completed_at: new Date().toISOString() });
      return sessionRepo.findById(id)!;
    },

    markFailed(id: string, error: string) {
      const session = sessionRepo.findById(id);
      if (!session) throw new Error("Session not found");
      if (session.status === "done" || session.status === "failed")
        throw new Error(`Cannot fail session in ${session.status} status`);
      sessionRepo.updateStatus(id, "failed", {
        error,
        completed_at: new Date().toISOString(),
      });
      return sessionRepo.findById(id)!;
    },

    findByTaskId(taskId: string) {
      return sessionRepo.findByTaskId(taskId);
    },

    findById(id: string) {
      return sessionRepo.findById(id);
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
