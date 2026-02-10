import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createTestDb, seedProject, type TestDb } from "../test-helpers.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createTaskService } from "../tasks/service.ts";
import { createProjectRepository } from "../projects/repository.ts";
import { createSessionRepository } from "./repository.ts";
import { createSessionService } from "./service.ts";
import { recoverStaleSessions } from "./recovery.ts";

describe("recoverStaleSessions", () => {
  let db: TestDb;
  let sessionRepo: ReturnType<typeof createSessionRepository>;
  let taskRepo: ReturnType<typeof createTaskRepository>;
  let projectRepo: ReturnType<typeof createProjectRepository>;
  let sessionService: ReturnType<typeof createSessionService>;
  let taskService: ReturnType<typeof createTaskService>;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    taskRepo = createTaskRepository(db);
    projectRepo = createProjectRepository(db);
    sessionRepo = createSessionRepository(db);
    sessionService = createSessionService(sessionRepo, taskRepo);
    taskService = createTaskService(taskRepo);
  });

  it("marks stuck provisioning session as failed", () => {
    const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
    taskService.activate(task.id);
    const session = sessionService.start(task.id);
    sessionService.markProvisioning(session.id, "banto-abc", "/tmp/wt");

    const removeWorktree = mock(() => {});
    recoverStaleSessions(sessionRepo, taskRepo, projectRepo, removeWorktree);

    const recovered = sessionRepo.findById(session.id)!;
    expect(recovered.status).toBe("failed");
    if (recovered.status === "failed") {
      expect(recovered.error).toBe("Server restarted");
    }
  });

  it("marks stuck running session as failed", () => {
    const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
    taskService.activate(task.id);
    const session = sessionService.start(task.id);
    sessionService.markProvisioning(session.id, "banto-abc", "/tmp/wt");
    sessionService.markRunning(session.id, "cc-1", "banto/abc");

    const removeWorktree = mock(() => {});
    recoverStaleSessions(sessionRepo, taskRepo, projectRepo, removeWorktree);

    const recovered = sessionRepo.findById(session.id)!;
    expect(recovered.status).toBe("failed");
  });

  it("calls removeWorktree for session with worktreePath", () => {
    const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
    taskService.activate(task.id);
    const session = sessionService.start(task.id);
    sessionService.markProvisioning(session.id, "banto-abc", "/tmp/test-wt/bt-fix-abc");

    const removeWorktree = mock(() => {});
    recoverStaleSessions(sessionRepo, taskRepo, projectRepo, removeWorktree);

    expect(removeWorktree).toHaveBeenCalledTimes(1);
    expect(removeWorktree).toHaveBeenCalledWith("/tmp/test", "/tmp/test-wt/bt-fix-abc");
  });

  it("does not throw when removeWorktree fails", () => {
    const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
    taskService.activate(task.id);
    const session = sessionService.start(task.id);
    sessionService.markProvisioning(session.id, "banto-abc", "/tmp/wt");

    const removeWorktree = mock(() => {
      throw new Error("cleanup failed");
    });

    expect(() =>
      recoverStaleSessions(sessionRepo, taskRepo, projectRepo, removeWorktree),
    ).not.toThrow();

    const recovered = sessionRepo.findById(session.id)!;
    expect(recovered.status).toBe("failed");
  });

  it("marks stuck pending session as failed without worktree cleanup", () => {
    const task = taskService.create({ projectId: "proj-1", title: "Fix bug" });
    taskService.activate(task.id);
    sessionService.start(task.id);

    const removeWorktree = mock(() => {});
    recoverStaleSessions(sessionRepo, taskRepo, projectRepo, removeWorktree);

    const sessions = sessionRepo.findByTaskId(task.id);
    expect(sessions[0]!.status).toBe("failed");
    expect(removeWorktree).not.toHaveBeenCalled();
  });
});
