import type { Database } from "bun:sqlite";
import type { SessionLog } from "../../shared/types.ts";

interface SessionLogRow {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string;
  exit_status: SessionLog["exitStatus"];
  error: string | null;
}

function toSessionLog(row: SessionLogRow): SessionLog {
  return {
    id: row.id,
    taskId: row.task_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitStatus: row.exit_status,
    error: row.error,
  };
}

export function createSessionLogRepository(db: Database) {
  return {
    insert(log: {
      id: string;
      taskId: string;
      startedAt: string;
      endedAt: string;
      exitStatus: "done" | "failed";
      error: string | null;
    }): SessionLog {
      db.query(
        "INSERT INTO session_logs (id, task_id, started_at, ended_at, exit_status, error) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(log.id, log.taskId, log.startedAt, log.endedAt, log.exitStatus, log.error);
      return this.findById(log.id)!;
    },

    findById(id: string): SessionLog | null {
      const row = db
        .query<SessionLogRow, [string]>("SELECT * FROM session_logs WHERE id = ?")
        .get(id);
      return row ? toSessionLog(row) : null;
    },

    findByTaskId(taskId: string): SessionLog[] {
      const rows = db
        .query<SessionLogRow, [string]>(
          "SELECT * FROM session_logs WHERE task_id = ? ORDER BY ended_at DESC",
        )
        .all(taskId);
      return rows.map(toSessionLog);
    },
  };
}

export type SessionLogRepository = ReturnType<typeof createSessionLogRepository>;
