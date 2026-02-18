import type { Database } from "bun:sqlite";
import type { Task, SessionStatus } from "../../shared/types.ts";

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  pinned: number;
  status: Task["status"];
  session_status: SessionStatus | null;
  worktree_path: string | null;
  branch: string | null;
  session_started_at: string | null;
  session_error: string | null;
  change_id: string | null;
  created_at: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    pinned: row.pinned === 1,
    status: row.status,
    sessionStatus: row.session_status,
    worktreePath: row.worktree_path,
    branch: row.branch,
    sessionStartedAt: row.session_started_at,
    sessionError: row.session_error,
    changeId: row.change_id,
    createdAt: row.created_at,
  };
}

export function createTaskRepository(db: Database) {
  return {
    findById(id: string): Task | null {
      const row = db.query<TaskRow, [string]>("SELECT * FROM tasks WHERE id = ?").get(id);
      return row ? toTask(row) : null;
    },

    findActive(): Task[] {
      const rows = db
        .query<TaskRow, []>("SELECT * FROM tasks WHERE status = 'active' ORDER BY created_at DESC")
        .all();
      return rows.map(toTask);
    },

    findBacklog(): Task[] {
      const rows = db
        .query<TaskRow, []>("SELECT * FROM tasks WHERE status = 'backlog' ORDER BY created_at DESC")
        .all();
      return rows.map(toTask);
    },

    findByProject(projectId: string): Task[] {
      const rows = db
        .query<TaskRow, [string]>(
          "SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC",
        )
        .all(projectId);
      return rows.map(toTask);
    },

    findPinned(): Task[] {
      const rows = db
        .query<TaskRow, []>("SELECT * FROM tasks WHERE pinned = 1 ORDER BY created_at DESC")
        .all();
      return rows.map(toTask);
    },

    findWithActiveSession(): Task[] {
      const rows = db
        .query<TaskRow, []>(
          "SELECT * FROM tasks WHERE session_status IN ('pending', 'provisioning', 'running', 'waiting_for_input')",
        )
        .all();
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

    updateChangeId(id: string, changeId: string | null): Task {
      db.query("UPDATE tasks SET change_id = ? WHERE id = ?").run(changeId, id);
      return this.findById(id)!;
    },

    updateSessionStatus(
      id: string,
      sessionStatus: SessionStatus | null,
      fields?: Partial<{
        worktreePath: string | null;
        branch: string | null;
        sessionStartedAt: string | null;
        sessionError: string | null;
      }>,
    ): Task {
      const sets = ["session_status = ?"];
      const values: (string | null)[] = [sessionStatus];

      if (fields) {
        if ("worktreePath" in fields) {
          sets.push("worktree_path = ?");
          values.push(fields.worktreePath ?? null);
        }
        if ("branch" in fields) {
          sets.push("branch = ?");
          values.push(fields.branch ?? null);
        }
        if ("sessionStartedAt" in fields) {
          sets.push("session_started_at = ?");
          values.push(fields.sessionStartedAt ?? null);
        }
        if ("sessionError" in fields) {
          sets.push("session_error = ?");
          values.push(fields.sessionError ?? null);
        }
      }

      values.push(id);
      db.query(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values);
      return this.findById(id)!;
    },

    resetSessionFields(id: string): Task {
      db.query(
        "UPDATE tasks SET session_status = NULL, worktree_path = NULL, branch = NULL, session_started_at = NULL, session_error = NULL WHERE id = ?",
      ).run(id);
      return this.findById(id)!;
    },
  };
}

export type TaskRepository = ReturnType<typeof createTaskRepository>;
