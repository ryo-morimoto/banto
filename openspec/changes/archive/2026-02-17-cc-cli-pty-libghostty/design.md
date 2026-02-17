## Context

banto currently runs Claude Code via the Agent SDK (`@anthropic-ai/claude-agent-sdk`), which emits structured messages (text blocks, tool names, status). These are pushed into an in-memory `logStore`, streamed to the client over SSE, and rendered as styled `<div>` elements in `SessionChatPanel` + `ChatMessage`.

This approach loses the native Claude Code CLI experience — colors, spinners, interactive prompts, and TUI layout are all stripped. The nixos-container approach was explored in `spike/` but abandoned because each container requires its own OAuth session.

The data model also has unnecessary indirection: `sessions` is a separate entity with a 1:N relationship to tasks, but in practice only one session is ever active per task. Past sessions are just logs — they don't need first-class entity status.

The new approach: spawn Claude Code CLI directly on the host as a PTY process, stream raw terminal data to the browser over WebSocket, render it with a proper terminal emulator, and simplify the data model by promoting the active session into the task itself.

### Key technology choices already made:
- **Bun `Bun.Terminal` API** (v1.3.5+) for PTY spawning — zero additional server deps
- **ghostty-web** (by Coder) for browser-side terminal rendering — xterm.js-compatible API, ~400KB WASM, MIT licensed
- **Elysia WebSocket** for bidirectional PTY ↔ browser relay

## Goals / Non-Goals

**Goals:**
- Full-fidelity Claude Code CLI rendering in the browser (colors, cursor, TUI layout)
- Bidirectional terminal: stdin input from browser reaches the PTY (enables `waiting_for_input`)
- Retain worktree isolation per session
- Simplify data model: promote active session into task, drop `sessions` and `messages` tables
- Terminal as SSoT for agent state (no duplicated todos/logs in DB)

**Non-Goals:**
- Multi-user terminal sharing or collaboration
- Terminal session persistence across server restarts (PTY is ephemeral)
- GPU-accelerated rendering via WebGPU (ghostty-web canvas renderer is sufficient)
- Persisting PTY output for past sessions (metadata-only archive is sufficient)
- Windows support (Bun.Terminal is POSIX-only, NixOS is the target)

## Decisions

### 1. Data model: Promote active session into task

**Choice**: Absorb the active session's state into the `tasks` table. Drop `sessions` and `messages` tables. Archive completed sessions as metadata-only rows in a new `session_logs` table.

**Before (3 entities):**
```
tasks ──1:N── sessions ──1:N── messages
```

**After (2 entities):**
```
tasks ──1:N── session_logs (cold metadata)
  │
  └── session_status, worktree_path, branch, ... (inline)
```

**Schema:**
```sql
tasks (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id),
  title              TEXT NOT NULL,
  description        TEXT,
  pinned             INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'backlog',
  -- active session (all nullable, null = no session)
  session_status     TEXT,
  worktree_path      TEXT,
  branch             TEXT,
  session_started_at TEXT,
  session_error      TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
)

session_logs (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  started_at  TEXT NOT NULL,
  ended_at    TEXT NOT NULL,
  exit_status TEXT NOT NULL,   -- 'done' | 'failed'
  error       TEXT
)

-- DROPPED: sessions table
-- DROPPED: messages table (PTY replaces structured logs)
-- DROPPED: todos column (terminal is SSoT for agent state)
```

**Rationale**:
- A task has at most one active session (orchestration agent). The 1:N `sessions` table is unnecessary indirection.
- If a session fails, a new one replaces it. Past sessions are archived as metadata — no output persistence needed.
- The `messages` table stored structured Agent SDK logs. PTY output replaces this entirely — the terminal view is the log.
- The `todos` column duplicated agent-generated todos into the DB. With the terminal rendered directly via ghostty-web, the user sees todos in the terminal itself. SSoT: don't copy what you can see live.

**State machine — two orthogonal axes on one entity:**
```
task.status (user-driven)          task.session_status (agent-driven)
─────────────────────────           ─────────────────────────────────
backlog ──► active ──► done         null (idle)
              ▲          │               │
              └──────────┘          "Start Session"
             (reopen)                    │
                                         ▼
                                    pending
                                         │
                                    provisioning
                                         │
                                    running ◄──► waiting_for_input
                                         │
                                    ┌────┴────┐
                                    ▼         ▼
                                  done      failed
                                    │         │
                                    └────┬────┘
                                         │
                                  "New Session" or task complete
                                         │
                                         ▼
                                  archive to session_logs
                                  reset active session fields to null
```

**Key transitions:**
- **Start Session**: `session_status` null → pending (only when `status = active`). `session_started_at` is set at this point (= when the user requested the session).
- **Session ends**: stays as done/failed so the UI can show the result
- **Retry / New Session**: archive current → `session_logs`, reset fields, start fresh
- **Complete Task**: archive current session if any, `status` → done

**Types:**
```ts
export type TaskStatus = "backlog" | "active" | "done";
export type SessionStatus =
  | "pending" | "provisioning" | "running"
  | "waiting_for_input" | "done" | "failed";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  pinned: boolean;
  status: TaskStatus;
  sessionStatus: SessionStatus | null;
  worktreePath: string | null;
  branch: string | null;
  sessionStartedAt: string | null;
  sessionError: string | null;
  createdAt: string;
}

export interface SessionLog {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string;
  exitStatus: "done" | "failed";
  error: string | null;
}
```

### 2. PTY spawning: `Bun.Terminal` API

**Choice**: Use Bun's built-in `Bun.Terminal` + `Bun.spawn({ terminal })` API.

**Alternatives considered**:
- `node-pty`: Mature, widely used. But adds a native dependency (node-gyp build) and Bun already ships PTY support natively since v1.3.5.
- `bun-pty` (community): Rust FFI-based. Unnecessary complexity when Bun has first-party support.

**Rationale**: Zero additional deps. The `Bun.Terminal` API provides `write()`, `resize()`, `data` callback, and `exit` callback — everything needed. Bun is already the runtime, so this is the natural choice.

**Interface sketch**:
```ts
const terminal = new Bun.Terminal({
  cols: 120,
  rows: 40,
  data(term, data) {
    // forward to WebSocket subscribers
    ptyStore.push(taskId, data);
  },
  exit() {
    // session completed — update task.session_status
  },
});

const proc = Bun.spawn(["claude"], {
  cwd: worktreePath,
  env: { ...process.env, CLAUDE_CODE_EXECUTABLE: undefined },
  terminal,
});
```

### 3. Browser terminal: ghostty-web

**Choice**: Use `ghostty-web` npm package (by Coder).

**Alternatives considered**:
- `xterm.js`: Industry standard, large ecosystem. But JavaScript-based VT parser is less correct than Ghostty's WASM-compiled parser. ghostty-web provides xterm.js API compatibility anyway.
- `libghostty` native WASM build: Not yet available as a standalone distribution. ghostty-web wraps it with the xterm.js-compatible API we need.
- `restty`: Built on libghostty-vt + WebGPU. Early stage, API unstable.

**Rationale**: ghostty-web is xterm.js API-compatible (easy migration path if needed), uses Ghostty's battle-tested VT parser via WASM (~400KB), zero runtime deps, MIT licensed, and already designed for the exact WebSocket + PTY pattern we need.

**Interface sketch**:
```ts
import { init, Terminal } from 'ghostty-web';

await init();
const term = new Terminal({ fontSize: 14, cols: 120, rows: 40 });
term.open(containerElement);

const ws = new WebSocket(`/api/tasks/${taskId}/terminal`);
term.onData((data) => ws.send(data));       // stdin: browser → PTY
ws.onmessage = (e) => term.write(e.data);   // stdout: PTY → browser
```

### 4. Transport: WebSocket as pure PTY pipe

**Choice**: Replace SSE (`/api/sessions/:id/logs/stream`) with a WebSocket (`/api/tasks/:id/terminal`) that carries only PTY data. Control operations (resize, session state) use separate REST endpoints.

**Alternatives considered**:
- Keep SSE for output + separate POST for input: Simpler server, but two connections per session and awkward latency for interactive input.
- Multiplex PTY data + JSON control on one WebSocket: Requires frame-type disambiguation logic on both sides. Unnecessary complexity — resize is low-frequency and session state is already available via TanStack Query.
- WebTransport: Better for high-throughput binary, but browser support is limited and overkill for this use case.

**Rationale**: The WebSocket only carries PTY bytes — no protocol mixing, no frame-type parsing. Resize is infrequent (window resize events only), so a REST call adds negligible latency. Session status changes are already propagated through TanStack Query cache invalidation. This separation keeps the WebSocket trivial: pipe in, pipe out.

**Protocol**:
```
WebSocket /api/tasks/:id/terminal
  server → client:  PTY stdout (binary frames)
  client → server:  PTY stdin (text frames, keystrokes)

REST (control plane)
  POST /api/tasks/:id/terminal/resize   { cols: number, rows: number }
  GET  /api/tasks/:id                   (session_status via normal task query)
```

### 5. PTY data store: Replace logStore with ptyStore

**Choice**: Replace the structured `logStore` (text/tool/error/status entries) with a `ptyStore` that buffers raw PTY output bytes per task.

**Design**:
- Buffer the last N bytes (e.g., 1MB) per task for replay when a client reconnects mid-session
- New WebSocket connections receive the buffered output first, then live data
- The `ptyStore` also manages subscriber sets per task (same pub/sub pattern as logStore)
- Buffer is discarded when a session is archived (new session starts fresh)

### 6. Session lifecycle integration

The runner updates task fields directly instead of managing a separate session entity.

**Start sequence (guard against concurrent requests)**:
```
startSession(taskId):
  1. BEGIN IMMEDIATE
  2. SELECT status, session_status FROM tasks WHERE id = ?
  3. IF status != 'active' → ROLLBACK, return 422 Unprocessable Entity
  4. IF session_status IS NOT NULL → ROLLBACK, return 409 Conflict
  5. UPDATE tasks SET session_status = 'pending',
                      session_started_at = datetime('now')
     WHERE id = ?
  6. COMMIT
  7. Spawn worktree + PTY asynchronously
  8. IF createWorktree()/spawn throws, UPDATE task to
     session_status = 'failed', session_error = <error message>
```

`BEGIN IMMEDIATE` acquires the write lock immediately. Combined with the null check, this prevents concurrent start requests from spawning multiple PTYs for the same task.

**Run sequence**:
```
(after start)
  createWorktree() + Bun.Terminal + Bun.spawn → session_status = provisioning
  first PTY data received                     → session_status = running
  output matches input-prompt heuristic       → session_status = waiting_for_input
  next PTY output or user stdin               → session_status = running
  process exits with code 0                   → session_status = done
  process exits with non-zero                 → session_status = failed, session_error = ...
```

**Teardown sequence (retry, new session, or task complete)**:
```
archiveSession(taskId):
  1. IF PTY process is alive → SIGTERM, wait grace period, SIGKILL if needed
  2. BEGIN IMMEDIATE
  3. SELECT session_status, session_started_at, worktree_path, session_error
     FROM tasks WHERE id = ?
  4. IF session_status IS NULL → COMMIT, clear ptyStore buffer, return (no-op)
  5. Capture worktree_path to local `worktreePathToDelete`
  6. INSERT INTO session_logs (id, task_id, started_at, ended_at, exit_status, error)
     SELECT gen_id(), id, COALESCE(session_started_at, datetime('now')), datetime('now'),
            CASE WHEN session_status = 'done' THEN 'done' ELSE 'failed' END,
            session_error
     FROM tasks WHERE id = ? AND session_status IS NOT NULL
  7. UPDATE tasks SET session_status = NULL, worktree_path = NULL,
                      branch = NULL, session_started_at = NULL,
                      session_error = NULL
     WHERE id = ?
  8. COMMIT
  9. Clear ptyStore buffer for this task
 10. Clean up `worktreePathToDelete` if exists
```

The teardown always kills the PTY first, preventing process leaks or output bleeding into a subsequent session.

**`waiting_for_input` state**: The PTY stdin is always open, so the user can type at any time. This state is driven by a lightweight output heuristic (prompt pattern match). If the heuristic does not match reliably, the implementation falls back to keeping `session_status = running` (safe degradation, no blocked input path).

### 7. Server startup recovery

**Choice**: On server start, mark all orphaned active sessions as failed and archive them.

```
On startup (before accepting HTTP):
  1. SELECT id, session_started_at, session_error, worktree_path FROM tasks
     WHERE session_status IN ('pending', 'provisioning', 'running', 'waiting_for_input')
  2. For each task:
     a. INSERT INTO session_logs (id, task_id, started_at, ended_at, exit_status, error)
        VALUES (gen_id(), id, COALESCE(session_started_at, datetime('now')),
                datetime('now'), 'failed',
                COALESCE(session_error, 'server restart'))
     b. Reset session_status, worktree_path, branch, session_started_at, session_error to NULL
     c. Clean up previous `worktree_path` if exists
  3. Clear ptyStore (empty on fresh start anyway)
```

**Rationale**: After a server restart, no PTY processes survive. Leaving `session_status = running` with no backing process would confuse the UI and block new sessions (the guard in Decision #6 would reject starts). Failing fast and letting the user retry is the simplest recovery path.

### 8. API surface change

```
Before                              After
──────                              ─────
GET  /api/tasks/:id                 GET  /api/tasks/:id  (includes session fields)
GET  /api/sessions?task_id=xxx      (removed)
POST /api/sessions                  POST /api/tasks/:id/session/start
GET  /api/sessions/:id/logs/stream  WS   /api/tasks/:id/terminal
                                    POST /api/tasks/:id/terminal/resize
                                    GET  /api/tasks/:id/session-logs  (cold, rarely used)
                                    POST /api/tasks/:id/session/retry
```

## Risks / Trade-offs

**[Bun.Terminal API stability]** → Bun.Terminal was introduced in v1.3.5 (Dec 2025). API may change in future Bun versions. Mitigation: Pin Bun version in flake.nix. The API surface is small enough to adapt quickly.

**[ghostty-web maturity]** → ghostty-web is early-stage. Some terminal features may have edge cases. Mitigation: It's xterm.js API-compatible, so fallback to xterm.js is a one-line import change.

**[No session replay after server restart]** → PTY buffer is in-memory only. If the server restarts, active session output is lost. Mitigation: This matches current behavior (logStore is also in-memory). The task's `session_status` persists in SQLite, so state recovery (mark as failed) is handled by Decision #7.

**[Binary WebSocket frame size]** → Large bursts of terminal output (e.g., `cat` of a big file) could flood the WebSocket. Mitigation: ghostty-web handles rendering efficiently; Elysia WebSocket has backpressure support.

**[Claude Code CLI version coupling]** → We depend on the CLI being installed on the host and behaving as a standard terminal application. Mitigation: Already the case with the current `CLAUDE_CODE_EXECUTABLE` approach. PTY is actually more robust than the Agent SDK since it just needs a binary that runs in a terminal.

**[Denormalized session state]** → Session fields on the task table are nullable and must be managed atomically. Mitigation: SQLite transactions with `BEGIN IMMEDIATE` ensure consistency. The set of fields is small (5 columns) and the lifecycle is well-defined.

## Open Questions

- **ghostty-web SSR/bundling**: How does ghostty-web's WASM initialization interact with Bun's bundler for the client build? May need to load WASM asynchronously.
- **Terminal dimensions**: Should the server dictate terminal size, or should the client negotiate on connect? Leaning toward client-driven resize via `POST /api/tasks/:id/terminal/resize` on initial connect.
- **Multiple viewers**: If two browser tabs open the same task terminal, should both see live output? Current design supports this via the pub/sub ptyStore, but input from multiple sources could conflict.
