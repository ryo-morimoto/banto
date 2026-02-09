import { Database } from "bun:sqlite";

export type TestDb = Database;

export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys=ON");

  db.run(`
    CREATE TABLE projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      repo_url    TEXT,
      local_path  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE tasks (
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
    CREATE TABLE sessions (
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
    CREATE TABLE attachments (
      id            TEXT PRIMARY KEY,
      task_id       TEXT NOT NULL REFERENCES tasks(id),
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}

export function seedProject(db: Database, id = "proj-1") {
  db.run("INSERT INTO projects (id, name, local_path) VALUES (?, ?, ?)", [
    id,
    "test-project",
    "/tmp/test",
  ]);
}
