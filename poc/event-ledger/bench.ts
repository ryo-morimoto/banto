/**
 * Event Ledger Benchmark
 *
 * Validates assumptions E1-E5 from .z/v2/validation/assumptions.md
 * by benchmarking SQLite WAL mode under banto's expected access pattern.
 *
 * Run: bun run poc/event-ledger/bench.ts
 */

import { Database } from "bun:sqlite";
import { randomUUIDv7 } from "bun";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ulid(): string {
  return randomUUIDv7();
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Schema & Seed
// ---------------------------------------------------------------------------

function applySchema(db: Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog'
        CHECK (status IN ('backlog', 'active', 'done')),
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX idx_tasks_status ON tasks(status);

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      agent_provider TEXT NOT NULL,
      agent_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'waiting_permission', 'done', 'failed')),
      status_confidence TEXT NOT NULL DEFAULT 'high'
        CHECK (status_confidence IN ('high', 'medium', 'low')),
      context_percent INTEGER CHECK (context_percent BETWEEN 0 AND 100),
      agent_summary TEXT,
      diff_summary TEXT,
      started_at TEXT,
      finished_at TEXT,
      exit_code INTEGER,
      error TEXT,
      instance_id TEXT,
      worktree_path TEXT,
      branch TEXT,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      scrollback_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_sessions_task_id ON sessions(task_id);
    CREATE INDEX idx_sessions_status ON sessions(status);
    CREATE INDEX idx_sessions_instance_id ON sessions(instance_id);

    CREATE TABLE session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      seq INTEGER NOT NULL,
      type TEXT NOT NULL
        CHECK (type IN (
          'status_changed', 'message', 'tool_use', 'tool_result',
          'permission_request', 'permission_response',
          'error', 'cost_update', 'context_update'
        )),
      source TEXT NOT NULL
        CHECK (source IN ('hook', 'protocol', 'mcp', 'process', 'heuristic', 'user', 'auto')),
      confidence TEXT NOT NULL DEFAULT 'high'
        CHECK (confidence IN ('high', 'medium', 'low')),
      payload TEXT NOT NULL,
      occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, seq)
    );
    CREATE INDEX idx_session_events_session_id ON session_events(session_id);

    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      type TEXT NOT NULL
        CHECK (type IN (
          'permission_required', 'session_done', 'session_failed',
          'context_warning', 'session_recovered', 'session_orphaned'
        )),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('critical', 'high', 'normal')),
      title TEXT NOT NULL,
      body TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_notifications_read ON notifications(read);
    CREATE INDEX idx_notifications_session_id ON notifications(session_id);
  `);
}

interface Seed {
  projectId: string;
  taskIds: string[];
  sessionIds: string[];
}

function seed(db: Database): Seed {
  const projectId = ulid();
  db.run("INSERT INTO projects (id, name, path) VALUES (?, ?, ?)", [
    projectId,
    "bench-project",
    "/tmp/bench-project",
  ]);

  const taskIds: string[] = [];
  const sessionIds: string[] = [];

  for (let i = 0; i < 5; i++) {
    const taskId = ulid();
    taskIds.push(taskId);
    db.run(
      "INSERT INTO tasks (id, project_id, title, status) VALUES (?, ?, ?, 'active')",
      [taskId, projectId, `Task ${i + 1}`],
    );

    const sessionId = ulid();
    sessionIds.push(sessionId);
    db.run(
      "INSERT INTO sessions (id, task_id, agent_provider, status, instance_id) VALUES (?, ?, 'claude-code', 'running', 'bench-instance')",
      [sessionId, taskId],
    );
  }

  return { projectId, taskIds, sessionIds };
}

// ---------------------------------------------------------------------------
// Event payload generators
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  "message",
  "tool_use",
  "tool_result",
  "cost_update",
  "context_update",
] as const;

function randomEventType(): string {
  return EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
}

function makePayload(type: string, seq: number): string {
  switch (type) {
    case "message":
      return JSON.stringify({
        role: "assistant",
        content: `Message content for event ${seq}`,
      });
    case "tool_use":
      return JSON.stringify({
        tool_name: "Read",
        tool_input: { file_path: `/src/file_${seq}.ts` },
      });
    case "tool_result":
      return JSON.stringify({
        tool_name: "Read",
        output: `File content for event ${seq}...`,
      });
    case "cost_update":
      return JSON.stringify({
        tokens_in: 1000 + seq,
        tokens_out: 200 + seq,
        cost_usd: 0.01 * seq,
      });
    case "context_update":
      return JSON.stringify({ context_percent: Math.min(100, seq % 100) });
    default:
      return JSON.stringify({ data: `event ${seq}` });
  }
}

// ---------------------------------------------------------------------------
// Benchmark 1: Sequential INSERT throughput
// ---------------------------------------------------------------------------

function bench1_sequentialInsert(db: Database, sessionId: string): {
  totalMs: number;
  eventsPerSec: number;
} {
  const COUNT = 10_000;
  const insert = db.prepare(
    "INSERT INTO session_events (session_id, seq, type, source, confidence, payload) VALUES (?, ?, ?, 'hook', 'high', ?)",
  );

  const start = performance.now();
  const tx = db.transaction(() => {
    for (let i = 1; i <= COUNT; i++) {
      const type = randomEventType();
      insert.run(sessionId, i, type, makePayload(type, i));
    }
  });
  tx();
  const totalMs = performance.now() - start;

  return {
    totalMs: Math.round(totalMs * 100) / 100,
    eventsPerSec: Math.round(COUNT / (totalMs / 1000)),
  };
}

// ---------------------------------------------------------------------------
// Benchmark 2: INSERT + materialization (event + session update in same tx)
// ---------------------------------------------------------------------------

function bench2_insertWithMaterialization(
  db: Database,
  sessionId: string,
): {
  totalMs: number;
  eventsPerSec: number;
} {
  // Clear events from bench1
  db.run("DELETE FROM session_events WHERE session_id = ?", [sessionId]);

  const COUNT = 10_000;
  const insertEvent = db.prepare(
    "INSERT INTO session_events (session_id, seq, type, source, confidence, payload) VALUES (?, ?, ?, 'hook', 'high', ?)",
  );
  const updateSession = db.prepare(
    "UPDATE sessions SET status = ?, context_percent = ? WHERE id = ?",
  );

  const start = performance.now();
  const tx = db.transaction(() => {
    for (let i = 1; i <= COUNT; i++) {
      const type = randomEventType();
      insertEvent.run(sessionId, i, type, makePayload(type, i));
      updateSession.run("running", Math.min(100, Math.floor(i / 100)), sessionId);
    }
  });
  tx();
  const totalMs = performance.now() - start;

  return {
    totalMs: Math.round(totalMs * 100) / 100,
    eventsPerSec: Math.round(COUNT / (totalMs / 1000)),
  };
}

// ---------------------------------------------------------------------------
// Benchmark 3: Concurrent read/write simulation
// ---------------------------------------------------------------------------

/**
 * Dashboard query (S1 from data-model.md)
 */
const DASHBOARD_QUERY = `
  SELECT
    t.id, t.title, t.status, t.pinned, t.project_id,
    p.name AS project_name,
    s.id AS session_id,
    s.status AS session_status,
    s.agent_provider,
    s.started_at,
    s.finished_at,
    s.branch,
    s.context_percent,
    s.tokens_in, s.tokens_out, s.cost_usd,
    s.diff_summary,
    s.error
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  LEFT JOIN sessions s ON s.id = (
    SELECT id FROM sessions
    WHERE task_id = t.id
    ORDER BY created_at DESC
    LIMIT 1
  )
  ORDER BY
    CASE WHEN s.status IN ('waiting_permission', 'failed') THEN 0 ELSE 1 END,
    t.pinned DESC,
    p.name, t.updated_at DESC
`;

function bench3_concurrentReadWrite(
  db: Database,
  sessionIds: string[],
): {
  writerLatencies: { p50: number; p95: number; p99: number };
  readerLatencies: { p50: number; p95: number; p99: number };
  busyErrors: number;
  totalWrites: number;
  totalReads: number;
  durationSec: number;
} {
  // Clear events
  db.run("DELETE FROM session_events");

  const DURATION_SEC = 30;
  const WRITE_INTERVAL_MS = 20; // 50/sec total (10/sec * 5 sessions)
  const READ_INTERVAL_MS = 100;

  const writerTimes: number[] = [];
  const readerTimes: number[] = [];
  let busyErrors = 0;

  const insertEvent = db.prepare(
    "INSERT INTO session_events (session_id, seq, type, source, confidence, payload) VALUES (?, ?, ?, 'hook', 'high', ?)",
  );
  const dashboardQuery = db.prepare(DASHBOARD_QUERY);

  const seqCounters = new Map<string, number>();
  for (const sid of sessionIds) {
    seqCounters.set(sid, 0);
  }

  const startTime = performance.now();
  const endTime = startTime + DURATION_SEC * 1000;

  let nextWrite = startTime;
  let nextRead = startTime;
  let writeSessionIdx = 0;

  while (performance.now() < endTime) {
    const now = performance.now();

    // Writer
    if (now >= nextWrite) {
      const sid = sessionIds[writeSessionIdx % sessionIds.length];
      writeSessionIdx++;
      const seq = (seqCounters.get(sid) ?? 0) + 1;
      seqCounters.set(sid, seq);
      const type = randomEventType();

      const ws = performance.now();
      try {
        insertEvent.run(sid, seq, type, makePayload(type, seq));
        writerTimes.push(performance.now() - ws);
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("SQLITE_BUSY")) {
          busyErrors++;
        } else {
          throw e;
        }
      }
      nextWrite += WRITE_INTERVAL_MS;
    }

    // Reader
    if (now >= nextRead) {
      const rs = performance.now();
      try {
        dashboardQuery.all();
        readerTimes.push(performance.now() - rs);
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("SQLITE_BUSY")) {
          busyErrors++;
        } else {
          throw e;
        }
      }
      nextRead += READ_INTERVAL_MS;
    }
  }

  writerTimes.sort((a, b) => a - b);
  readerTimes.sort((a, b) => a - b);

  const round = (n: number) => Math.round(n * 1000) / 1000;

  return {
    writerLatencies: {
      p50: round(percentile(writerTimes, 50)),
      p95: round(percentile(writerTimes, 95)),
      p99: round(percentile(writerTimes, 99)),
    },
    readerLatencies: {
      p50: round(percentile(readerTimes, 50)),
      p95: round(percentile(readerTimes, 95)),
      p99: round(percentile(readerTimes, 99)),
    },
    busyErrors,
    totalWrites: writerTimes.length,
    totalReads: readerTimes.length,
    durationSec: DURATION_SEC,
  };
}

// ---------------------------------------------------------------------------
// Benchmark 4: Notification INSERT during event processing
// ---------------------------------------------------------------------------

function bench4_notificationOverhead(
  db: Database,
  sessionId: string,
): {
  eventOnlyMs: number;
  eventPlusNotificationMs: number;
  overheadMs: number;
  overheadPercent: number;
} {
  db.run("DELETE FROM session_events");

  const COUNT = 5_000;

  const insertEvent = db.prepare(
    "INSERT INTO session_events (session_id, seq, type, source, confidence, payload) VALUES (?, ?, ?, 'hook', 'high', ?)",
  );
  const insertNotification = db.prepare(
    "INSERT INTO notifications (session_id, type, priority, title, body) VALUES (?, ?, ?, ?, ?)",
  );

  // Event-only pass
  const t1 = performance.now();
  const tx1 = db.transaction(() => {
    for (let i = 1; i <= COUNT; i++) {
      const type = randomEventType();
      insertEvent.run(sessionId, i, type, makePayload(type, i));
    }
  });
  tx1();
  const eventOnlyMs = performance.now() - t1;

  // Clean up
  db.run("DELETE FROM session_events WHERE session_id = ?", [sessionId]);
  db.run("DELETE FROM notifications");

  // Event + conditional notification pass
  // Simulate: every 50th event triggers a context_warning notification
  const t2 = performance.now();
  const tx2 = db.transaction(() => {
    for (let i = 1; i <= COUNT; i++) {
      const type = randomEventType();
      insertEvent.run(sessionId, i, type, makePayload(type, i));

      if (i % 50 === 0) {
        insertNotification.run(
          sessionId,
          "context_warning",
          "normal",
          "Context usage warning",
          `Context at ${Math.min(100, Math.floor(i / 50))}%`,
        );
      }
    }
  });
  tx2();
  const eventPlusNotificationMs = performance.now() - t2;

  const overheadMs = eventPlusNotificationMs - eventOnlyMs;

  return {
    eventOnlyMs: Math.round(eventOnlyMs * 100) / 100,
    eventPlusNotificationMs: Math.round(eventPlusNotificationMs * 100) / 100,
    overheadMs: Math.round(overheadMs * 100) / 100,
    overheadPercent:
      Math.round((overheadMs / eventOnlyMs) * 100 * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Benchmark 5: JSON round-trip validation (E5)
// ---------------------------------------------------------------------------

function bench5_jsonRoundTrip(db: Database, sessionId: string): {
  totalTests: number;
  failures: number;
  failedPayloads: string[];
} {
  db.run("DELETE FROM session_events WHERE session_id = ?", [sessionId]);
  db.run("DELETE FROM notifications");

  const testPayloads = [
    { simple: "string" },
    { nested: { deep: { value: 42 } } },
    { array: [1, "two", null, true, false] },
    { unicode: "Hello \u4e16\u754c \ud83d\ude80" },
    { special: 'quotes "and" backslashes \\' },
    { empty: {} },
    { nullVal: null },
    { numbers: { int: 42, float: 3.14, neg: -1, zero: 0, sci: 1e10 } },
    { booleans: { t: true, f: false } },
    { longString: "x".repeat(10_000) },
  ];

  const insert = db.prepare(
    "INSERT INTO session_events (session_id, seq, type, source, confidence, payload) VALUES (?, ?, 'message', 'hook', 'high', ?)",
  );
  const select = db.prepare(
    "SELECT payload FROM session_events WHERE session_id = ? AND seq = ?",
  );

  const failures: string[] = [];

  for (let i = 0; i < testPayloads.length; i++) {
    const original = JSON.stringify(testPayloads[i]);
    insert.run(sessionId, i + 1, original);
    const row = select.get(sessionId, i + 1) as { payload: string } | null;

    if (!row) {
      failures.push(`seq ${i + 1}: row not found`);
      continue;
    }

    // Round-trip: stringify -> store -> retrieve -> parse -> stringify
    const roundTripped = JSON.stringify(JSON.parse(row.payload));
    if (roundTripped !== original) {
      failures.push(
        `seq ${i + 1}: mismatch\n  original:    ${original}\n  roundtripped: ${roundTripped}`,
      );
    }
  }

  return {
    totalTests: testPayloads.length,
    failures: failures.length,
    failedPayloads: failures,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("=== Event Ledger Benchmark ===\n");

  // Use file-based DB for WAL mode (in-memory doesn't support WAL)
  const dbPath = "/tmp/banto-bench.sqlite";
  try {
    Bun.spawnSync(["rm", "-f", dbPath, `${dbPath}-wal`, `${dbPath}-shm`]);
  } catch {
    // ignore
  }

  const db = new Database(dbPath);
  applySchema(db);
  const { sessionIds } = seed(db);

  // Benchmark 1
  console.log("--- Benchmark 1: Sequential INSERT ---");
  const b1 = bench1_sequentialInsert(db, sessionIds[0]);
  console.log(`  Total time: ${b1.totalMs}ms`);
  console.log(`  Throughput: ${formatNum(b1.eventsPerSec)} events/sec`);
  console.log();

  // Benchmark 2
  console.log("--- Benchmark 2: INSERT + Materialization ---");
  const b2 = bench2_insertWithMaterialization(db, sessionIds[0]);
  console.log(`  Total time: ${b2.totalMs}ms`);
  console.log(`  Throughput: ${formatNum(b2.eventsPerSec)} events/sec`);
  console.log(
    `  Overhead vs INSERT-only: ${formatNum(b2.totalMs - b1.totalMs)}ms (${formatNum(((b2.totalMs - b1.totalMs) / b1.totalMs) * 100)}%)`,
  );
  console.log();

  // Benchmark 3
  console.log("--- Benchmark 3: Concurrent Read/Write (30s) ---");
  const b3 = bench3_concurrentReadWrite(db, sessionIds);
  console.log(
    `  Writer: p50=${b3.writerLatencies.p50}ms p95=${b3.writerLatencies.p95}ms p99=${b3.writerLatencies.p99}ms`,
  );
  console.log(
    `  Reader: p50=${b3.readerLatencies.p50}ms p95=${b3.readerLatencies.p95}ms p99=${b3.readerLatencies.p99}ms`,
  );
  console.log(`  SQLITE_BUSY errors: ${b3.busyErrors}`);
  console.log(`  Total writes: ${b3.totalWrites}, Total reads: ${b3.totalReads}`);
  console.log();

  // Benchmark 4
  console.log("--- Benchmark 4: Notification Overhead ---");
  const b4 = bench4_notificationOverhead(db, sessionIds[1]);
  console.log(`  Event-only (5k): ${b4.eventOnlyMs}ms`);
  console.log(`  Event+notification (5k + 100 notifs): ${b4.eventPlusNotificationMs}ms`);
  console.log(`  Overhead: ${b4.overheadMs}ms (${b4.overheadPercent}%)`);
  console.log();

  // Benchmark 5 (JSON round-trip)
  console.log("--- Benchmark 5: JSON Round-Trip (E5) ---");
  const b5 = bench5_jsonRoundTrip(db, sessionIds[2]);
  console.log(
    `  Tests: ${b5.totalTests}, Failures: ${b5.failures}`,
  );
  if (b5.failures > 0) {
    for (const f of b5.failedPayloads) {
      console.log(`  FAIL: ${f}`);
    }
  }
  console.log();

  db.close();

  // Clean up
  Bun.spawnSync(["rm", "-f", dbPath, `${dbPath}-wal`, `${dbPath}-shm`]);

  // Return results for report generation
  return { b1, b2, b3, b4, b5 };
}

const results = main();

// Export for potential programmatic use
export { results };
