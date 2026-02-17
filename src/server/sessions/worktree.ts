import { mkdirSync, rmSync, readdirSync, rmdirSync } from "node:fs";
import { dirname } from "node:path";

// Strip git environment variables that interfere when spawning git
// commands targeting a different repo (e.g. inside a pre-commit hook).
function cleanGitEnv(): Record<string, string | undefined> {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  delete env.GIT_OBJECT_DIRECTORY;
  delete env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  return env;
}

export function getWorktreePath(projectLocalPath: string, slug: string, sessionId: string): string {
  return `${projectLocalPath}-wt/bt-${slug}-${sessionId.slice(0, 8)}`;
}

export function createWorktree(repoPath: string, branch: string, destPath: string): void {
  mkdirSync(dirname(destPath), { recursive: true });
  const result = Bun.spawnSync(["git", "worktree", "add", "-b", branch, destPath, "main"], {
    cwd: repoPath,
    env: cleanGitEnv(),
  });
  if (result.exitCode !== 0) {
    throw new Error(`git worktree add failed: ${new TextDecoder().decode(result.stderr)}`);
  }
}

export function removeWorktree(repoPath: string, destPath: string, branch?: string): void {
  const env = cleanGitEnv();

  // Try git worktree remove --force first
  const result = Bun.spawnSync(["git", "worktree", "remove", "--force", destPath], {
    cwd: repoPath,
    env,
  });

  if (result.exitCode !== 0) {
    // Fallback: rm + prune
    rmSync(destPath, { recursive: true, force: true });
    Bun.spawnSync(["git", "worktree", "prune"], { cwd: repoPath, env });
  }

  // Delete the associated branch so retries can re-create it
  if (branch) {
    Bun.spawnSync(["git", "branch", "-D", branch], { cwd: repoPath, env });
  }

  // Best-effort: remove parent -wt directory if empty
  const parentDir = dirname(destPath);
  try {
    const entries = readdirSync(parentDir);
    if (entries.length === 0) {
      rmdirSync(parentDir);
    }
  } catch {
    // Parent doesn't exist or not empty — ignore
  }
}
