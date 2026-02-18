import { describe, it, expect, beforeEach } from "bun:test";
import { createTestDb, seedProject, type TestDb } from "../test-helpers.ts";
import { createTaskService } from "./service.ts";
import { createTaskRepository } from "./repository.ts";

describe("TaskService", () => {
  let db: TestDb;
  let service: ReturnType<typeof createTaskService>;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    const repo = createTaskRepository(db);
    service = createTaskService(repo);
  });

  describe("create", () => {
    it("creates a task in backlog status", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });

      expect(task.title).toBe("Fix bug");
      expect(task.status).toBe("backlog");
      expect(task.pinned).toBe(false);
      expect(task.projectId).toBe("proj-1");
    });
  });

  describe("activate", () => {
    it("transitions task from backlog to active", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      const activated = service.activate(task.id);

      expect(activated.status).toBe("active");
    });

    it("throws when task is already active", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      service.activate(task.id);

      expect(() => service.activate(task.id)).toThrow();
    });
  });

  describe("complete", () => {
    it("transitions task from active to done", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      service.activate(task.id);
      const completed = service.complete(task.id);

      expect(completed.status).toBe("done");
    });

    it("throws when task is in backlog", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });

      expect(() => service.complete(task.id)).toThrow();
    });
  });

  describe("reopen", () => {
    it("transitions task from done to active", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      service.activate(task.id);
      service.complete(task.id);
      const reopened = service.reopen(task.id);

      expect(reopened.status).toBe("active");
    });

    it("throws when task is in backlog", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });

      expect(() => service.reopen(task.id)).toThrow();
    });
  });

  describe("pin / unpin", () => {
    it("pins a task", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      const pinned = service.pin(task.id);

      expect(pinned.pinned).toBe(true);
    });

    it("unpins a task", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      service.pin(task.id);
      const unpinned = service.unpin(task.id);

      expect(unpinned.pinned).toBe(false);
    });
  });

  describe("listActive", () => {
    it("returns only active tasks grouped by project", () => {
      const t1 = service.create({ projectId: "proj-1", title: "A" });
      service.create({ projectId: "proj-1", title: "B" });
      service.activate(t1.id);
      // t2 stays in backlog

      const active = service.listActive();

      expect(active).toHaveLength(1);
      expect(active[0]!.title).toBe("A");
    });

    it("returns pinned tasks regardless of status", () => {
      const t1 = service.create({ projectId: "proj-1", title: "Pinned backlog" });
      service.pin(t1.id);

      const pinned = service.listPinned();

      expect(pinned).toHaveLength(1);
      expect(pinned[0]!.title).toBe("Pinned backlog");
    });
  });

  describe("listBacklog", () => {
    it("returns only backlog tasks", () => {
      service.create({ projectId: "proj-1", title: "A" });
      const t2 = service.create({ projectId: "proj-1", title: "B" });
      service.activate(t2.id);

      const backlog = service.listBacklog();

      expect(backlog).toHaveLength(1);
      expect(backlog[0]!.title).toBe("A");
    });
  });

  describe("listByProject", () => {
    it("returns all tasks for a project", () => {
      service.create({ projectId: "proj-1", title: "A" });
      const t2 = service.create({ projectId: "proj-1", title: "B" });
      service.activate(t2.id);

      const tasks = service.listByProject("proj-1");

      expect(tasks).toHaveLength(2);
    });
  });

  describe("update description", () => {
    it("updates task description", () => {
      const task = service.create({ projectId: "proj-1", title: "Fix bug" });
      const updated = service.updateDescription(task.id, "Use offset-based pagination");

      expect(updated.description).toBe("Use offset-based pagination");
    });
  });

  describe("linkChange / unlinkChange", () => {
    it("links a change to a task", () => {
      const task = service.create({ projectId: "proj-1", title: "Add resize" });
      const linked = service.linkChange(task.id, "pty-resize-fix");

      expect(linked.changeId).toBe("pty-resize-fix");
    });

    it("unlinks a change from a task", () => {
      const task = service.create({ projectId: "proj-1", title: "Add resize" });
      service.linkChange(task.id, "pty-resize-fix");
      const unlinked = service.unlinkChange(task.id);

      expect(unlinked.changeId).toBeNull();
    });

    it("throws when task not found", () => {
      expect(() => service.linkChange("nonexistent", "some-change")).toThrow("Task not found");
    });

    it("newly created task has no changeId", () => {
      const task = service.create({ projectId: "proj-1", title: "New task" });

      expect(task.changeId).toBeNull();
    });
  });
});
