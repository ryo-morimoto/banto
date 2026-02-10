import type { Database } from "bun:sqlite";
import type { Attachment } from "../../shared/types.ts";

interface AttachmentRow {
  id: string;
  task_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  created_at: string;
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    taskId: row.task_id,
    filename: row.filename,
    originalName: row.original_name,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export function createAttachmentRepository(db: Database) {
  return {
    findById(id: string): Attachment | null {
      const row = db
        .query("SELECT * FROM attachments WHERE id = ?")
        .get(id) as AttachmentRow | null;
      return row ? toAttachment(row) : null;
    },

    findByTaskId(taskId: string): Attachment[] {
      const rows = db
        .query("SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC")
        .all(taskId) as AttachmentRow[];
      return rows.map(toAttachment);
    },

    insert(attachment: {
      id: string;
      taskId: string;
      filename: string;
      originalName: string;
      mimeType: string;
    }): Attachment {
      db.query(
        "INSERT INTO attachments (id, task_id, filename, original_name, mime_type) VALUES (?, ?, ?, ?, ?)",
      ).run(
        attachment.id,
        attachment.taskId,
        attachment.filename,
        attachment.originalName,
        attachment.mimeType,
      );
      return this.findById(attachment.id)!;
    },

    delete(id: string): void {
      db.query("DELETE FROM attachments WHERE id = ?").run(id);
    },
  };
}

export type AttachmentRepository = ReturnType<typeof createAttachmentRepository>;
