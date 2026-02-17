import type { Database } from "bun:sqlite";
import type { Project } from "../../shared/types.ts";

interface ProjectRow {
  id: string;
  name: string;
  repo_url: string | null;
  local_path: string;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    repoUrl: row.repo_url,
    localPath: row.local_path,
    createdAt: row.created_at,
  };
}

export function createProjectRepository(db: Database) {
  return {
    findAll(): Project[] {
      const rows = db
        .query<ProjectRow, []>("SELECT * FROM projects ORDER BY created_at DESC")
        .all();
      return rows.map(toProject);
    },

    findById(id: string): Project | null {
      const row = db.query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?").get(id);
      return row ? toProject(row) : null;
    },

    insert(project: { id: string; name: string; repoUrl?: string; localPath: string }): Project {
      db.query("INSERT INTO projects (id, name, repo_url, local_path) VALUES (?, ?, ?, ?)").run(
        project.id,
        project.name,
        project.repoUrl ?? null,
        project.localPath,
      );
      return this.findById(project.id)!;
    },

    remove(id: string): void {
      db.query("DELETE FROM projects WHERE id = ?").run(id);
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;
