import { describe, it, expect, beforeEach } from "bun:test";
import { createTestDb, seedProject, type TestDb } from "../test-helpers.ts";
import { createTaskRepository } from "../tasks/repository.ts";
import { createTaskService } from "../tasks/service.ts";
import { createSessionRepository } from "../sessions/repository.ts";
import { createSessionService } from "../sessions/service.ts";
import { createMessageRepository } from "./repository.ts";

describe("MessageRepository", () => {
  let db: TestDb;
  let repo: ReturnType<typeof createMessageRepository>;
  let sessionId: string;

  beforeEach(() => {
    db = createTestDb();
    seedProject(db);
    const taskRepo = createTaskRepository(db);
    const taskService = createTaskService(taskRepo);
    const task = taskService.create({ projectId: "proj-1", title: "Test task" });
    taskService.activate(task.id);
    const sessionRepo = createSessionRepository(db);
    const sessionService = createSessionService(sessionRepo, taskRepo);
    const session = sessionService.start(task.id);
    sessionId = session.id;
    repo = createMessageRepository(db);
  });

  describe("insert", () => {
    it("inserts a message and returns it", () => {
      const msg = repo.insert({
        sessionId,
        role: "assistant",
        content: "Hello",
      });

      expect(msg.id).toBeDefined();
      expect(msg.sessionId).toBe(sessionId);
      expect(msg.role).toBe("assistant");
      expect(msg.content).toBe("Hello");
      expect(msg.toolName).toBeNull();
      expect(msg.createdAt).toBeDefined();
    });

    it("inserts a tool message with tool name", () => {
      const msg = repo.insert({
        sessionId,
        role: "tool",
        content: "Read src/foo.ts",
        toolName: "Read",
      });

      expect(msg.role).toBe("tool");
      expect(msg.toolName).toBe("Read");
    });
  });

  describe("findBySessionId", () => {
    it("returns messages ordered by created_at ASC", () => {
      repo.insert({ sessionId, role: "assistant", content: "First" });
      repo.insert({ sessionId, role: "tool", content: "Tool call", toolName: "Bash" });
      repo.insert({ sessionId, role: "assistant", content: "Second" });

      const messages = repo.findBySessionId(sessionId);

      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).toBe("First");
      expect(messages[1]!.content).toBe("Tool call");
      expect(messages[2]!.content).toBe("Second");
    });

    it("returns empty array for session with no messages", () => {
      expect(repo.findBySessionId(sessionId)).toHaveLength(0);
    });

    it("does not return messages from other sessions", () => {
      repo.insert({ sessionId, role: "assistant", content: "Mine" });

      const otherSessionId = crypto.randomUUID();
      const row = db.query("SELECT task_id FROM sessions WHERE id = ?").get(sessionId) as {
        task_id: string;
      };
      db.run("INSERT INTO sessions (id, task_id) VALUES (?, ?)", [otherSessionId, row.task_id]);

      const messages = repo.findBySessionId(otherSessionId);
      expect(messages).toHaveLength(0);
    });
  });
});
