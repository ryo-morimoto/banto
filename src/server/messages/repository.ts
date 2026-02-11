import type { Database } from "bun:sqlite";
import type { Message } from "../../shared/types.ts";

interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_name: string | null;
  created_at: string;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as Message["role"],
    content: row.content,
    toolName: row.tool_name,
    createdAt: row.created_at,
  };
}

export function createMessageRepository(db: Database) {
  return {
    insert(input: {
      sessionId: string;
      role: string;
      content: string;
      toolName?: string;
    }): Message {
      const id = crypto.randomUUID();
      db.query(
        "INSERT INTO messages (id, session_id, role, content, tool_name) VALUES (?, ?, ?, ?, ?)",
      ).run(id, input.sessionId, input.role, input.content, input.toolName ?? null);
      return this.findById(id)!;
    },

    findById(id: string): Message | null {
      const row = db.query("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow | null;
      return row ? toMessage(row) : null;
    },

    findBySessionId(sessionId: string): Message[] {
      const rows = db
        .query("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
        .all(sessionId) as MessageRow[];
      return rows.map(toMessage);
    },
  };
}

export type MessageRepository = ReturnType<typeof createMessageRepository>;
