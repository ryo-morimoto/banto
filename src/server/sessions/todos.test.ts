import { describe, it, expect, beforeEach } from "bun:test";
import { createTestDb, seedProject, type TestDb } from "../test-helpers.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createTaskService } from "../tasks/service.ts";
import { createSessionRepository } from "./repository.ts";
import { createSessionService } from "./service.ts";
import type { TodoItem } from "../../shared/types.ts";

describe("Session todos", () => {
  let db: TestDb;
  let sessionRepo: ReturnType<typeof createSessionRepository>;
  let sessionId: string;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    const taskRepo = createTaskRepository(db);
    const taskService = createTaskService(taskRepo);
    const task = taskService.create({ projectId: "proj-1", title: "Test task" });
    taskService.activate(task.id);
    sessionRepo = createSessionRepository(db);
    const service = createSessionService(sessionRepo, taskRepo);
    const session = service.start(task.id);
    sessionId = session.id;
  });

  it("returns null todos for a new session", () => {
    const todos = sessionRepo.getTodos(sessionId);
    expect(todos).toBeNull();
  });

  it("stores and retrieves todos", () => {
    const items: TodoItem[] = [
      { content: "Write tests", status: "completed" },
      { content: "Implement feature", status: "in_progress" },
      { content: "Refactor", status: "pending" },
    ];

    sessionRepo.updateTodos(sessionId, items);
    const todos = sessionRepo.getTodos(sessionId);

    expect(todos).toHaveLength(3);
    expect(todos![0]!.content).toBe("Write tests");
    expect(todos![0]!.status).toBe("completed");
    expect(todos![1]!.status).toBe("in_progress");
    expect(todos![2]!.status).toBe("pending");
  });

  it("replaces todos on subsequent updates", () => {
    sessionRepo.updateTodos(sessionId, [{ content: "Old task", status: "pending" }]);

    sessionRepo.updateTodos(sessionId, [{ content: "New task", status: "in_progress" }]);

    const todos = sessionRepo.getTodos(sessionId);
    expect(todos).toHaveLength(1);
    expect(todos![0]!.content).toBe("New task");
  });

  it("includes todos in session returned by findById", () => {
    const items: TodoItem[] = [{ content: "Do something", status: "pending" }];
    sessionRepo.updateTodos(sessionId, items);

    const session = sessionRepo.findById(sessionId);
    expect(session).not.toBeNull();
    expect(session!.todos).toHaveLength(1);
    expect(session!.todos![0]!.content).toBe("Do something");
  });

  it("returns null todos in session when not set", () => {
    const session = sessionRepo.findById(sessionId);
    expect(session!.todos).toBeNull();
  });
});
