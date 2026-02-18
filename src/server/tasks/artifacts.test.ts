import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readArtifacts } from "./artifacts.ts";

describe("readArtifacts", () => {
  const tmpDir = join(import.meta.dir, "__test_artifacts__");
  const changePath = join(tmpDir, "openspec/changes/test-change");

  beforeEach(() => {
    mkdirSync(changePath, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null for all artifacts when change directory is empty", async () => {
    const result = await readArtifacts(tmpDir, "test-change");

    expect(result.proposal).toBeNull();
    expect(result.design).toBeNull();
    expect(result.tasks).toBeNull();
  });

  it("reads proposal.md when it exists", async () => {
    writeFileSync(join(changePath, "proposal.md"), "## Why\nFix the bug");

    const result = await readArtifacts(tmpDir, "test-change");

    expect(result.proposal).toBe("## Why\nFix the bug");
  });

  it("reads design.md when it exists", async () => {
    writeFileSync(join(changePath, "design.md"), "## Context\nCurrent state");

    const result = await readArtifacts(tmpDir, "test-change");

    expect(result.design).toBe("## Context\nCurrent state");
  });

  it("reads tasks.md when it exists", async () => {
    writeFileSync(join(changePath, "tasks.md"), "- [ ] 1.1 Do thing");

    const result = await readArtifacts(tmpDir, "test-change");

    expect(result.tasks).toBe("- [ ] 1.1 Do thing");
  });

  it("reads all artifacts when they all exist", async () => {
    writeFileSync(join(changePath, "proposal.md"), "proposal content");
    writeFileSync(join(changePath, "design.md"), "design content");
    writeFileSync(join(changePath, "tasks.md"), "tasks content");

    const result = await readArtifacts(tmpDir, "test-change");

    expect(result.proposal).toBe("proposal content");
    expect(result.design).toBe("design content");
    expect(result.tasks).toBe("tasks content");
  });

  it("returns all null when change directory does not exist", async () => {
    const result = await readArtifacts(tmpDir, "nonexistent");

    expect(result.proposal).toBeNull();
    expect(result.design).toBeNull();
    expect(result.tasks).toBeNull();
  });
});
