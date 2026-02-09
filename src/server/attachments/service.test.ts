import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createTestDb, seedProject, type TestDb } from "../test-helpers.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createTaskService } from "../tasks/service.ts";
import { createAttachmentRepository } from "./repository.ts";
import { createAttachmentService } from "./service.ts";

describe("AttachmentService", () => {
  let db: TestDb;
  let taskService: ReturnType<typeof createTaskService>;
  let service: ReturnType<typeof createAttachmentService>;
  let storageDir: string;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    const taskRepo = createTaskRepository(db);
    taskService = createTaskService(taskRepo);
    const attachmentRepo = createAttachmentRepository(db);
    storageDir = join(tmpdir(), `banto-test-${crypto.randomUUID()}`);
    mkdirSync(storageDir, { recursive: true });
    service = createAttachmentService(attachmentRepo, storageDir);
  });

  afterEach(() => {
    rmSync(storageDir, { recursive: true, force: true });
  });

  describe("upload", () => {
    it("saves file to disk and creates DB record", async () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix UI bug" });
      const fileData = new Uint8Array([137, 80, 78, 71]); // PNG magic bytes

      const attachment = await service.upload(task.id, fileData, "screenshot.png", "image/png");

      expect(attachment.taskId).toBe(task.id);
      expect(attachment.originalName).toBe("screenshot.png");
      expect(attachment.mimeType).toBe("image/png");
      expect(existsSync(join(storageDir, task.id, attachment.filename))).toBe(true);
    });

    it("creates task subdirectory if not exists", async () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      const fileData = new Uint8Array([255, 216, 255]); // JPEG magic bytes

      await service.upload(task.id, fileData, "photo.jpg", "image/jpeg");

      expect(existsSync(join(storageDir, task.id))).toBe(true);
    });
  });

  describe("list", () => {
    it("returns attachments for a task", async () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      await service.upload(task.id, new Uint8Array([1]), "a.png", "image/png");
      await service.upload(task.id, new Uint8Array([2]), "b.png", "image/png");

      const list = service.listByTaskId(task.id);

      expect(list).toHaveLength(2);
    });

    it("returns empty array for task with no attachments", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });

      expect(service.listByTaskId(task.id)).toHaveLength(0);
    });
  });

  describe("delete", () => {
    it("removes file from disk and DB record", async () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      const attachment = await service.upload(task.id, new Uint8Array([1]), "a.png", "image/png");
      const filePath = service.getFilePath(attachment.id);

      service.remove(attachment.id);

      expect(service.listByTaskId(task.id)).toHaveLength(0);
      expect(existsSync(filePath!)).toBe(false);
    });

    it("does nothing for non-existent attachment", () => {
      expect(() => service.remove("non-existent")).not.toThrow();
    });
  });

  describe("getFilePath", () => {
    it("returns full path for existing attachment", async () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      const attachment = await service.upload(task.id, new Uint8Array([1]), "a.png", "image/png");

      const filePath = service.getFilePath(attachment.id);

      expect(filePath).toBe(join(storageDir, task.id, attachment.filename));
    });

    it("returns null for non-existent attachment", () => {
      expect(service.getFilePath("non-existent")).toBeNull();
    });
  });
});
