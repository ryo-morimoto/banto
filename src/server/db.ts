import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function applySchema(db: Database) {
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
      id                 TEXT PRIMARY KEY,
      project_id         TEXT NOT NULL REFERENCES projects(id),
      title              TEXT NOT NULL,
      description        TEXT,
      pinned             INTEGER NOT NULL DEFAULT 0,
      status             TEXT NOT NULL DEFAULT 'backlog',
      session_status     TEXT,
      worktree_path      TEXT,
      branch             TEXT,
      session_started_at TEXT,
      session_error      TEXT,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS session_logs (
      id          TEXT PRIMARY KEY,
      task_id     TEXT NOT NULL REFERENCES tasks(id),
      started_at  TEXT NOT NULL,
      ended_at    TEXT NOT NULL,
      exit_status TEXT NOT NULL,
      error       TEXT
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

  // Migrations for existing databases
  migrateFromLegacySchema(db);
}

function migrateFromLegacySchema(db: Database) {
  // Add session columns to tasks if they don't exist
  const sessionColumns = [
    "session_status TEXT",
    "worktree_path TEXT",
    "branch TEXT",
    "session_started_at TEXT",
    "session_error TEXT",
  ];
  for (const col of sessionColumns) {
    try {
      db.run(`ALTER TABLE tasks ADD COLUMN ${col}`);
    } catch {}
  }

  // Drop legacy tables if they exist
  db.run("DROP TABLE IF EXISTS messages");
  db.run("DROP TABLE IF EXISTS sessions");
}

function getDbPath(): string {
  const dataHome = process.env["XDG_DATA_HOME"] || join(process.env["HOME"]!, ".local/share");
  const dir = join(dataHome, "banto");
  mkdirSync(dir, { recursive: true });
  return join(dir, "banto.db");
}

const db = new Database(getDbPath(), { create: true });

db.run("PRAGMA journal_mode=WAL");
db.run("PRAGMA foreign_keys=ON");
applySchema(db);

export { db };
