import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function getDbPath(): string {
  const dataHome = process.env["XDG_DATA_HOME"] || join(process.env["HOME"]!, ".local/share");
  const dir = join(dataHome, "banto");
  mkdirSync(dir, { recursive: true });
  return join(dir, "banto.db");
}

const db = new Database(getDbPath(), { create: true });

db.run("PRAGMA journal_mode=WAL");
db.run("PRAGMA foreign_keys=ON");

db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    repo_url    TEXT,
    local_path  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    title       TEXT NOT NULL,
    description TEXT,
    pinned      INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'backlog',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    task_id         TEXT NOT NULL REFERENCES tasks(id),
    status          TEXT NOT NULL DEFAULT 'pending',
    container_name  TEXT,
    cc_session_id   TEXT,
    branch          TEXT,
    error           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS attachments (
    id            TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL REFERENCES tasks(id),
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

try {
  db.run("ALTER TABLE sessions ADD COLUMN worktree_path TEXT");
} catch {}

export { db };
