import { Database } from "bun:sqlite";
import { applySchema } from "./db.ts";

export type TestDb = Database;

export function createTestDb(): Database {
  const db = new Database(":memory:");
  db.run("PRAGMA foreign_keys=ON");
  applySchema(db);
  return db;
}

export function seedProject(db: Database, id = "proj-1") {
  db.run("INSERT INTO projects (id, name, local_path) VALUES (?, ?, ?)", [
    id,
    "test-project",
    "/tmp/test",
  ]);
}
