import type { TaskRepository } from "./repository.ts";

export function createTaskService(repo: TaskRepository) {
  return {
    create(input: { projectId: string; title: string; description?: string }) {
      const id = crypto.randomUUID();
      repo.insert({ id, ...input });
      return repo.findById(id)!;
    },

    activate(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      if (task.status !== "backlog")
        throw new Error(`Cannot activate task in ${task.status} status`);
      repo.updateStatus(id, "active");
      return repo.findById(id)!;
    },

    complete(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      if (task.status !== "active")
        throw new Error(`Cannot complete task in ${task.status} status`);
      repo.updateStatus(id, "done");
      return repo.findById(id)!;
    },

    reopen(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      if (task.status !== "done") throw new Error(`Cannot reopen task in ${task.status} status`);
      repo.updateStatus(id, "active");
      return repo.findById(id)!;
    },

    pin(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      repo.updatePinned(id, true);
      return repo.findById(id)!;
    },

    unpin(id: string) {
      const task = repo.findById(id);
      if (!task) throw new Error("Task not found");
      repo.updatePinned(id, false);
      return repo.findById(id)!;
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
      repo.updateDescription(id, description);
      return repo.findById(id)!;
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
