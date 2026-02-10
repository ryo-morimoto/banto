import type { Database } from "bun:sqlite";
import type { Session } from "../../shared/types.ts";

interface SessionRow {
  id: string;
  task_id: string;
  status: string;
  container_name: string | null;
  cc_session_id: string | null;
  branch: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

function toSession(row: SessionRow): Session {
  const base = { id: row.id, taskId: row.task_id, createdAt: row.created_at };

  switch (row.status) {
    case "pending":
      return { ...base, status: "pending" };
    case "provisioning":
      return { ...base, status: "provisioning", containerName: row.container_name! };
    case "running":
      return {
        ...base,
        status: "running",
        containerName: row.container_name!,
        ccSessionId: row.cc_session_id!,
        branch: row.branch!,
      };
    case "done":
      return {
        ...base,
        status: "done",
        containerName: row.container_name!,
        ccSessionId: row.cc_session_id!,
        branch: row.branch!,
        completedAt: row.completed_at!,
      };
    case "failed":
      return {
        ...base,
        status: "failed",
        containerName: row.container_name!,
        error: row.error!,
        completedAt: row.completed_at!,
      };
    default:
      throw new Error(`Unknown session status: ${row.status}`);
  }
}

export function createSessionRepository(db: Database) {
  return {
    findById(id: string): Session | null {
      const row = db.query("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | null;
      return row ? toSession(row) : null;
    },

    findByTaskId(taskId: string): Session[] {
      const rows = db
        .query("SELECT * FROM sessions WHERE task_id = ? ORDER BY created_at DESC")
        .all(taskId) as SessionRow[];
      return rows.map(toSession);
    },

    findActiveByTaskId(taskId: string): Session | null {
      const row = db
        .query(
          "SELECT * FROM sessions WHERE task_id = ? AND status IN ('pending', 'provisioning', 'running')",
        )
        .get(taskId) as SessionRow | null;
      return row ? toSession(row) : null;
    },

    insert(session: { id: string; taskId: string }): void {
      db.query("INSERT INTO sessions (id, task_id) VALUES (?, ?)").run(session.id, session.taskId);
    },

    updateStatus(id: string, status: string, fields?: Record<string, string>): void {
      if (fields && Object.keys(fields).length > 0) {
        const sets = ["status = ?"];
        const values: string[] = [status];
        for (const [key, value] of Object.entries(fields)) {
          sets.push(`${key} = ?`);
          values.push(value);
        }
        values.push(id);
        db.query(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).run(...values);
      } else {
        db.query("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
      }
    },
  };
}

export type SessionRepository = ReturnType<typeof createSessionRepository>;
