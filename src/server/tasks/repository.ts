import type { Database } from "bun:sqlite";
import type { Task } from "../../shared/types.ts";

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  pinned: number;
  status: string;
  created_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    pinned: row.pinned === 1,
    status: row.status as Task["status"],
    createdAt: row.created_at,
  };
}

export function createTaskRepository(db: Database) {
  return {
    findById(id: string): Task | null {
      const row = db.query("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | null;
      return row ? toTask(row) : null;
    },

    findActive(): Task[] {
      const rows = db
        .query("SELECT * FROM tasks WHERE status = 'active' ORDER BY created_at DESC")
        .all() as TaskRow[];
      return rows.map(toTask);
    },

    findBacklog(): Task[] {
      const rows = db
        .query("SELECT * FROM tasks WHERE status = 'backlog' ORDER BY created_at DESC")
        .all() as TaskRow[];
      return rows.map(toTask);
    },

    findByProject(projectId: string): Task[] {
      const rows = db
        .query("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC")
        .all(projectId) as TaskRow[];
      return rows.map(toTask);
    },

    findPinned(): Task[] {
      const rows = db
        .query("SELECT * FROM tasks WHERE pinned = 1 ORDER BY created_at DESC")
        .all() as TaskRow[];
      return rows.map(toTask);
    },

    insert(task: { id: string; projectId: string; title: string; description?: string }): Task {
      db.query("INSERT INTO tasks (id, project_id, title, description) VALUES (?, ?, ?, ?)").run(
        task.id,
        task.projectId,
        task.title,
        task.description ?? null,
      );
      return this.findById(task.id)!;
    },

    updateStatus(id: string, status: string): Task {
      db.query("UPDATE tasks SET status = ? WHERE id = ?").run(status, id);
      return this.findById(id)!;
    },

    updatePinned(id: string, pinned: boolean): Task {
      db.query("UPDATE tasks SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, id);
      return this.findById(id)!;
    },

    updateDescription(id: string, description: string): Task {
      db.query("UPDATE tasks SET description = ? WHERE id = ?").run(description, id);
      return this.findById(id)!;
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
