import { describe, it, expect, beforeEach } from "bun:test";
import { createTestDb, seedProject, type TestDb } from "../test-helpers.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createTaskService } from "../tasks/service.ts";
import { createSessionRepository } from "./repository.ts";
import { createSessionService } from "./service.ts";

describe("SessionService", () => {
  let db: TestDb;
  let taskService: ReturnType<typeof createTaskService>;
  let service: ReturnType<typeof createSessionService>;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    const taskRepo = createTaskRepository(db);
    taskService = createTaskService(taskRepo);
    const sessionRepo = createSessionRepository(db);
    service = createSessionService(sessionRepo, taskRepo);
  });

  describe("start", () => {
    it("creates a session in pending status for an active task", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);

      const session = service.start(task.id);

      expect(session.status).toBe("pending");
      expect(session.taskId).toBe(task.id);
    });

    it("throws when task is not active", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });

      expect(() => service.start(task.id)).toThrow();
    });

    it("throws when task already has a concurrent session", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      service.start(task.id);

      expect(() => service.start(task.id)).toThrow();
    });
  });

  describe("markProvisioning", () => {
    it("transitions pending to provisioning with container name", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);

      const updated = service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");

      expect(updated.status).toBe("provisioning");
      if (updated.status === "provisioning") {
        expect(updated.containerName).toBe("banto-abc123");
      }
    });

    it("throws when session is not pending", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");

      expect(() => service.markProvisioning(session.id, "banto-xyz", "/tmp/wt2")).toThrow();
    });
  });

  describe("markRunning", () => {
    it("transitions provisioning to running", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");

      const updated = service.markRunning(session.id, "cc-sess-1", "fix/bug-123");

      expect(updated.status).toBe("running");
      if (updated.status === "running") {
        expect(updated.ccSessionId).toBe("cc-sess-1");
        expect(updated.branch).toBe("fix/bug-123");
      }
    });

    it("throws when session is not provisioning", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);

      expect(() => service.markRunning(session.id, "cc-1", "branch")).toThrow();
    });
  });

  describe("markDone", () => {
    it("transitions running to done", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");

      const updated = service.markDone(session.id);

      expect(updated.status).toBe("done");
      if (updated.status === "done") {
        expect(updated.completedAt).toBeDefined();
      }
    });

    it("throws when session is not running", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);

      expect(() => service.markDone(session.id)).toThrow();
    });
  });

  describe("markFailed", () => {
    it("transitions any non-terminal status to failed", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);

      const updated = service.markFailed(session.id, "Container crashed");

      expect(updated.status).toBe("failed");
      if (updated.status === "failed") {
        expect(updated.error).toBe("Container crashed");
        expect(updated.completedAt).toBeDefined();
      }
    });

    it("throws when session is already done", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");
      service.markDone(session.id);

      expect(() => service.markFailed(session.id, "too late")).toThrow();
    });
  });

  describe("markWaitingForInput", () => {
    it("transitions running to waiting_for_input", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");

      const updated = service.markWaitingForInput(session.id);

      expect(updated.status).toBe("waiting_for_input");
    });

    it("throws when session is not running", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);

      expect(() => service.markWaitingForInput(session.id)).toThrow();
    });
  });

  describe("resumeFromWaiting", () => {
    it("transitions waiting_for_input back to running", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");
      service.markWaitingForInput(session.id);

      const updated = service.resumeFromWaiting(session.id);

      expect(updated.status).toBe("running");
    });

    it("throws when session is not waiting_for_input", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");

      expect(() => service.resumeFromWaiting(session.id)).toThrow();
    });
  });

  describe("markDone from waiting_for_input", () => {
    it("transitions waiting_for_input to done", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");
      service.markWaitingForInput(session.id);

      const updated = service.markDone(session.id);

      expect(updated.status).toBe("done");
    });
  });

  describe("markFailed from waiting_for_input", () => {
    it("transitions waiting_for_input to failed", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");
      service.markWaitingForInput(session.id);

      const updated = service.markFailed(session.id, "aborted");

      expect(updated.status).toBe("failed");
    });
  });

  describe("waiting_for_input is active session", () => {
    it("counts as active session preventing concurrent start", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const session = service.start(task.id);
      service.markProvisioning(session.id, "banto-abc123", "/tmp/wt");
      service.markRunning(session.id, "cc-sess-1", "fix/bug-123");
      service.markWaitingForInput(session.id);

      expect(() => service.start(task.id)).toThrow();
    });
  });

  describe("findByTaskId", () => {
    it("returns all sessions for a task", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
      taskService.activate(task.id);
      const s1 = service.start(task.id);
      service.markFailed(s1.id, "oops");
      service.start(task.id);

      const sessions = service.findByTaskId(task.id);

      expect(sessions).toHaveLength(2);
    });

    it("returns empty array for task with no sessions", () => {
      const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });

      expect(service.findByTaskId(task.id)).toHaveLength(0);
    });
  });
});
