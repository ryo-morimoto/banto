import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { getWorktreePath, createWorktree, removeWorktree } from "./worktree.ts";

function cleanGitEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  return env;
}

function gitSync(args: string[], cwd: string) {
  return Bun.spawnSync(["git", ...args], { cwd, env: cleanGitEnv() });
}

function initTestRepo(repoPath: string) {
  gitSync(["init", "-b", "main"], repoPath);
  gitSync(["config", "user.email", "test@test.com"], repoPath);
  gitSync(["config", "user.name", "Test"], repoPath);
  gitSync(["commit", "--allow-empty", "-m", "init"], repoPath);
}

describe("getWorktreePath", () => {
  it("returns correct path format", () => {
    const result = getWorktreePath("/home/user/repos/myapp", "fix-login-bug", "a1b2c3d4-e5f6");
    expect(result).toBe("/home/user/repos/myapp-wt/bt-fix-login-bug-a1b2c3d4");
  });

  it("slices sessionId to first 8 characters", () => {
    const result = getWorktreePath("/tmp/repo", "my-slug", "abcdefgh-ijkl-mnop");
    expect(result).toBe("/tmp/repo-wt/bt-my-slug-abcdefgh");
  });
});

describe("createWorktree", () => {
  const testRepoBase = "/tmp/banto-test-worktree";
  const repoPath = join(testRepoBase, "repo");
  const wtPath = join(testRepoBase, "repo-wt", "bt-test-a1b2c3d4");

  beforeEach(() => {
    rmSync(testRepoBase, { recursive: true, force: true });
    mkdirSync(repoPath, { recursive: true });
    initTestRepo(repoPath);
  });

  afterEach(() => {
    gitSync(["worktree", "prune"], repoPath);
    rmSync(testRepoBase, { recursive: true, force: true });
  });

  it("creates a worktree directory and branch", () => {
    createWorktree(repoPath, "banto/test-branch", wtPath);

    expect(existsSync(wtPath)).toBe(true);

    const result = gitSync(["branch", "--list", "banto/test-branch"], repoPath);
    expect(new TextDecoder().decode(result.stdout)).toContain("banto/test-branch");
  });

  it("creates parent directory if it does not exist", () => {
    const deepWtPath = join(testRepoBase, "repo-wt", "deep", "bt-test-a1b2c3d4");
    createWorktree(repoPath, "banto/deep-branch", deepWtPath);
    expect(existsSync(deepWtPath)).toBe(true);
  });
});

describe("removeWorktree", () => {
  const testRepoBase = "/tmp/banto-test-worktree-rm";
  const repoPath = join(testRepoBase, "repo");
  const wtDir = join(testRepoBase, "repo-wt");
  const wtPath = join(wtDir, "bt-test-a1b2c3d4");

  beforeEach(() => {
    rmSync(testRepoBase, { recursive: true, force: true });
    mkdirSync(repoPath, { recursive: true });
    initTestRepo(repoPath);
  });

  afterEach(() => {
    gitSync(["worktree", "prune"], repoPath);
    rmSync(testRepoBase, { recursive: true, force: true });
  });

  it("removes an existing worktree", () => {
    createWorktree(repoPath, "banto/rm-branch", wtPath);
    expect(existsSync(wtPath)).toBe(true);

    removeWorktree(repoPath, wtPath);
    expect(existsSync(wtPath)).toBe(false);
  });

  it("cleans up empty parent directory", () => {
    createWorktree(repoPath, "banto/rm-branch2", wtPath);
    removeWorktree(repoPath, wtPath);

    // Parent -wt directory should be cleaned up if empty
    expect(existsSync(wtDir)).toBe(false);
  });

  it("does not throw when worktree directory does not exist", () => {
    expect(() => removeWorktree(repoPath, "/tmp/nonexistent-worktree-path")).not.toThrow();
  });
});
