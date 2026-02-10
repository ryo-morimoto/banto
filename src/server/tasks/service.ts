import type { TaskRepository } from "./repository.ts";

export function createTaskService(repo: TaskRepository) {
  return {
    create(input: { projectId: string; title: string; description?: string }) {
      const id = crypto.randomUUID();
      return repo.insert({ id, ...input });
    },

    activate(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      if (task.status !== "backlog")
        throw new Error(`Cannot activate task in ${task.status} status`);
      return repo.updateStatus(id, "active");
    },

    complete(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      if (task.status !== "active")
        throw new Error(`Cannot complete task in ${task.status} status`);
      return repo.updateStatus(id, "done");
    },

    reopen(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      if (task.status !== "done") throw new Error(`Cannot reopen task in ${task.status} status`);
      return repo.updateStatus(id, "active");
    },

    pin(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      return repo.updatePinned(id, true);
    },

    unpin(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      return repo.updatePinned(id, false);
    },

    listActive() {
      return repo.findActive();
    },

    listBacklog() {
      return repo.findBacklog();
    },

    listByProject(projectId: string) {
      return repo.findByProject(projectId);
    },

    listPinned() {
      return repo.findPinned();
    },

    updateDescription(id: string, description: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      return repo.updateDescription(id, description);
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
