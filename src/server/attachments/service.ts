import { mkdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AttachmentRepository } from "./repository.ts";

export function createAttachmentService(repo: AttachmentRepository, storageDir: string) {
  return {
    async upload(taskId: string, data: Uint8Array, originalName: string, mimeType: string) {
      const id = crypto.randomUUID();
      const ext = originalName.includes(".")
        ? originalName.slice(originalName.lastIndexOf("."))
        : "";
      const filename = `${id}${ext}`;
      const taskDir = join(storageDir, taskId);
      mkdirSync(taskDir, { recursive: true });
      await Bun.write(join(taskDir, filename), data);
      return repo.insert({ id, taskId, filename, originalName, mimeType });
    },

    listByTaskId(taskId: string) {
      return repo.findByTaskId(taskId);
    },

    getFilePath(id: string): string | null {
      const attachment = repo.findById(id);
      if (!attachment) return null;
      return join(storageDir, attachment.taskId, attachment.filename);
    },

    remove(id: string) {
      const attachment = repo.findById(id);
      if (!attachment) return;
      const filePath = join(storageDir, attachment.taskId, attachment.filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
      repo.delete(id);
    },
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;
