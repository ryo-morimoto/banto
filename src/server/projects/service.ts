import type { ProjectRepository } from "./repository.ts";

export function createProjectService(repo: ProjectRepository) {
  return {
    list() {
      return repo.findAll();
    },

    create(input: { name: string; localPath: string; repoUrl?: string }) {
      const id = crypto.randomUUID();
      return repo.insert({ id, ...input });
    },

    remove(id: string) {
      const project = repo.findById(id);
      if (!project) throw new Error("Project not found");
      repo.remove(id);
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
