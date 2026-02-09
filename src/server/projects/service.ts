import type { ProjectRepository } from "./repository.ts";

export function createProjectService(repo: ProjectRepository) {
  return {
    list() {
      return repo.findAll();
    },

    create(input: { name: string; localPath: string; repoUrl?: string }) {
      const id = crypto.randomUUID();
      repo.insert({ id, ...input });
      return repo.findById(id)!;
    },

    remove(id: string) {
      const project = repo.findById(id);
      if (!project) throw new Error("Project not found");
      repo.remove(id);
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
