import { describe, it, expect, beforeEach } from "bun:test";
import { createTestDb, type TestDb } from "../test-helpers.ts";
import { createProjectService } from "./service.ts";
import { createProjectRepository } from "./repository.ts";

describe("ProjectService", () => {
  let db: TestDb;
  let service: ReturnType<typeof createProjectService>;

  beforeEach(() => {
    db = createTestDb();
    const repo = createProjectRepository(db);
    service = createProjectService(repo);
  });

  describe("create", () => {
    it("creates a project and returns it", () => {
      const project = service.create({ name: "my-app", localPath: "/home/user/my-app" });

      expect(project.name).toBe("my-app");
      expect(project.localPath).toBe("/home/user/my-app");
      expect(project.id).toBeDefined();
    });

    it("sets repoUrl when provided", () => {
      const project = service.create({
        name: "my-app",
        localPath: "/home/user/my-app",
        repoUrl: "https://github.com/user/my-app",
      });

      expect(project.repoUrl).toBe("https://github.com/user/my-app");
    });

    it("sets repoUrl to null when not provided", () => {
      const project = service.create({ name: "my-app", localPath: "/home/user/my-app" });

      expect(project.repoUrl).toBeNull();
    });
  });

  describe("list", () => {
    it("returns empty array when no projects", () => {
      expect(service.list()).toEqual([]);
    });

    it("returns all projects", () => {
      service.create({ name: "a", localPath: "/a" });
      service.create({ name: "b", localPath: "/b" });

      expect(service.list()).toHaveLength(2);
    });
  });

  describe("remove", () => {
    it("removes an existing project", () => {
      const project = service.create({ name: "a", localPath: "/a" });
      service.remove(project.id);

      expect(service.list()).toHaveLength(0);
    });

    it("throws when project not found", () => {
      expect(() => service.remove("nonexistent")).toThrow("Project not found");
    });
  });
});
