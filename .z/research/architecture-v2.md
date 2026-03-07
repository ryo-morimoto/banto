# banto v2 Architecture

Date: 2026-03-06

## Problem

Solo developer, multiple projects, NixOS mini PC, Tailscale access.
Jot down tasks, throw at agent, watch results.

## Decisions

- 1-app (web 統合)。2-app 分離は破棄
- セッションは tasks テーブルから分離 (sessions + session_events)
- ターミナルは libghostty-vt (WASM) + WebGPU でブラウザ内レンダリング
- ダッシュボード（構造化ビュー）が主、ターミナルは従

## Architecture

```
┌─ Browser ──────────────────────────────────────────────┐
│                                                         │
│  Dashboard (React)          Terminal Widget              │
│  ・Status Card              ・libghostty-vt (WASM)      │
│  ・Session Timeline         ・WebGPU renderer            │
│  ・Git Summary              ・Touch gestures             │
│  ・Session History          ・WebSocket PTY stream       │
│                                                         │
│         ↕ REST + SSE              ↕ WebSocket            │
└─────────────────────────────────────────────────────────┘
                          │
┌─ banto server (NixOS) ──┴──────────────────────────────┐
│  Elysia API                                             │
│  ├─ Task / Project CRUD                                 │
│  ├─ Session lifecycle (start / stop / input)            │
│  ├─ SSE stream (status changes, events)                 │
│  ├─ WebSocket (PTY binary, on-demand)                   │
│  ├─ Git diff/commits (from worktree)                    │
│  │                                                      │
│  PTY Manager                                            │
│  ├─ Bun.Terminal + Bun.spawn                            │
│  ├─ Ring buffer (1MB, replay)                           │
│  ├─ Observation layer (output → events)                 │
│  └─ State machine (transitions → SSE + DB)              │
│                                                         │
│  SQLite (bun:sqlite)                                    │
│  ├─ projects                                            │
│  ├─ tasks                                               │
│  ├─ sessions                                            │
│  └─ session_events                                      │
└─────────────────────────────────────────────────────────┘
```

## UI

### Desktop

```
┌─────────────────────────────────────────────────────────┐
│ banto                                    [+ New Task]   │
├───────────────────┬─────────────────────────────────────┤
│ Pinned            │                                     │
│  Task A ● running │  Task A                             │
│  Task B ◉ waiting │  Fix auth bug in login flow         │
│                   │                                     │
│ project-alpha     │  ┌─ Status ───────────────────────┐ │
│  Task C ● running │  │ ● running  banto/a1b2          │ │
│  Task D ○ idle    │  │ 3 files  +42 -12  12s ago      │ │
│                   │  │ [Stop] [Approve]                │ │
│ project-beta      │  └────────────────────────────────┘ │
│  Task E ● running │                                     │
│                   │  ┌─ Timeline ─────────────────────┐ │
│                   │  │ 14:08  Tests passed             │ │
│                   │  │ 14:07  Editing src/auth.test.ts │ │
│                   │  │ 14:06  2 tests failed           │ │
│                   │  │ 14:05  Running tests            │ │
│                   │  │ 14:03  Editing src/login.ts     │ │
│                   │  │ 14:02  Editing src/auth.ts      │ │
│                   │  │ 14:01  Session started          │ │
│                   │  └────────────────────────────────┘ │
│                   │                                     │
│                   │  ┌─ Git ──────────────────────────┐ │
│                   │  │ src/auth.ts       +18 -4       │ │
│                   │  │ src/login.ts      +12 -3       │ │
│                   │  │ src/auth.test.ts  +12 -5       │ │
│                   │  │ [Full Diff]                    │ │
│                   │  └────────────────────────────────┘ │
│                   │                                     │
│                   │  ┌─ Terminal (expanded) ──────────┐ │
│                   │  │ ┌──────────────────────────┐   │ │
│                   │  │ │ $ claude "Fix auth bug"   │   │ │
│                   │  │ │ ⏺ Editing src/auth.ts    │   │ │
│                   │  │ │ ✓ Applied changes         │   │ │
│                   │  │ │ ⏺ Running tests...        │   │ │
│                   │  │ └──────────────────────────┘   │ │
│                   │  └────────────────────────────────┘ │
│                   │                                     │
│                   │  ┌─ History ──────────────────────┐ │
│                   │  │ #2  done   14:01 - 14:12       │ │
│                   │  │ #1  failed 13:20 - 13:25       │ │
│                   │  └────────────────────────────────┘ │
└───────────────────┴─────────────────────────────────────┘
```

### Mobile (Touch)

```
┌───────────────────────┐
│ banto          [+]    │
├───────────────────────┤
│ Task A  ● running     │  ← tap to select
│ Task B  ◉ waiting     │
│ Task C  ● running     │
├───────────────────────┤
│ Task A                 │
│ ● running  12s ago     │
│ 3 files  +42 -12      │
│ [Stop] [Approve]       │
│                        │
│ Timeline ──────────    │
│ 14:08  Tests passed    │
│ 14:07  Editing test    │
│ ...                    │
│                        │
│ ▶ Terminal             │  ← tap to expand
│ ▶ Git                  │
│ ▶ History              │
└────────────────────────┘

Touch gestures (terminal expanded):
  Swipe up/down  → scroll
  Long press     → selection
  Pinch          → font size
  Two-finger pan → pan
```

### Terminal Widget Behavior

- **running session**: expanded by default
- **done/failed session**: collapsed by default
- **no session**: hidden
- WebSocket connects only when widget is visible (IntersectionObserver)
- Tab hidden → WebSocket close. Tab visible → reconnect + replay buffer

## Data Model

```sql
projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  repo_url    TEXT,
  local_path  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)

tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  title       TEXT NOT NULL,
  description TEXT,
  pinned      INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'backlog',  -- backlog | active | done
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)

sessions (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  status      TEXT NOT NULL DEFAULT 'starting',
  branch      TEXT,
  work_dir    TEXT,
  error       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT
)

session_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL REFERENCES sessions(id),
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,  -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)
```

### Session Status

```
starting | running | waiting_input | waiting_permission | done | failed
```

### Event Types

```
state_change      {from, to, reason}
tool_use          {tool, path}
file_edit         {path, added, removed}
test_run          {passed, failed}
permission_ask    {action}
error             {message}
```

### Dropped Tables

- `session_logs` → sessions テーブルに統合（完了セッション = ログ）
- `attachments` → 後回し（description にファイルパスを書く）
- tasks の session 系カラム → sessions テーブルに移動

## Session State Machine

```
starting
  → running              first PTY output
  → failed               spawn error

running
  → waiting_input        idle > 10s or prompt detected
  → waiting_permission   permission prompt detected
  → done                 exit code 0
  → failed               exit code != 0

waiting_input
  → running              new PTY output
  → done                 exit code 0
  → failed               exit code != 0

waiting_permission
  → running              new PTY output after input
  → done                 exit code 0
  → failed               exit code != 0
```

Every transition:
1. UPDATE sessions.status
2. INSERT session_events (state_change)
3. Push SSE event to connected clients

## Observation Layer

```
PTY output (raw bytes from Bun.Terminal)
  │
  ├─→ Ring buffer (1MB, for terminal widget replay)
  │
  ├─→ Line accumulator → Event extractor
  │     ├─ "⏺ " → tool_use event
  │     ├─ "? " → permission_ask + state → waiting_permission
  │     ├─ "✓ " / "✗ " → tool result
  │     ├─ file path pattern → file_edit event
  │     ├─ test pattern → test_run event
  │     └─ idle > 10s → state → waiting_input
  │
  └─→ WebSocket subscribers (terminal widget, binary)
```

Design principle: false negatives OK (timeline has fewer entries), false positives bad (wrong events worse than no events).

## Terminal Widget: libghostty-vt + WebGPU

### Why Not ghostty-web

banto v1 experience:
- IME handling broken → wrote custom ime-controller.ts
- Resize broken → wrote custom FitAddon equivalent
- ANSI colors → had to pass explicit theme
- Input bridge → manual compositionstart/update/end handling
- Canvas renderer → no GPU acceleration

### Target: restty or equivalent

restty (libghostty-vt + WebGPU + text-shaper):
- WebGPU rendering with WebGL2 fallback
- IME built-in (hidden IME input auto-generated)
- Touch support (pan-first scrolling, selection modes)
- libghostty-vt direct (no ghostty-web patch layer)

Integration plan:
- restty handles VT parse + render + input
- banto connects PTY WebSocket to restty instance
- Visibility-aware: connect on expand, disconnect on collapse
- Replay buffer on reconnect

### MoonBit (future consideration)

If MoonBit reaches 1.0 and WASM Component Model matures,
consider MoonBit for a custom WebGPU renderer layer.
VT parsing stays libghostty-vt regardless.

## Real-time

```
Dashboard  ←── SSE: session status changes, new session_events
Terminal   ←── WebSocket: raw PTY binary stream (on-demand)
```

### SSE Events

```
event: session_status
data: {"sessionId":"abc","taskId":"xyz","status":"running","at":"..."}

event: session_event
data: {"sessionId":"abc","type":"file_edit","payload":{"path":"src/auth.ts","added":18,"removed":4},"at":"..."}
```

### WebSocket (Terminal)

Same protocol as current: bidirectional binary.
- Server → Client: PTY output (Uint8Array)
- Client → Server: keyboard input (UTF-8 string)
- On connect: server sends replay buffer
- On close code 1000: session ended normally

## API

```
# Tasks
GET    /api/tasks                    list (filter: status, projectId)
POST   /api/tasks                    create
GET    /api/tasks/:id                detail + latest session summary
PATCH  /api/tasks/:id                update (title, description, status, pinned)
DELETE /api/tasks/:id                delete

# Projects
GET    /api/projects
POST   /api/projects
DELETE /api/projects/:id

# Sessions
POST   /api/tasks/:id/sessions       start new session
GET    /api/tasks/:id/sessions       list all sessions for task
GET    /api/sessions/:id             session detail
POST   /api/sessions/:id/stop        graceful stop (SIGTERM → SIGKILL 5s)
POST   /api/sessions/:id/input       send text input (permission approval etc.)

# Session Events
GET    /api/sessions/:id/events      list (paginated, newest first)

# Git
GET    /api/sessions/:id/diff        diff summary (files + stats)
GET    /api/sessions/:id/diff/full   full unified diff

# Real-time
GET    /api/events                   SSE stream
WS     /api/sessions/:id/terminal    PTY binary stream
```

## Frontend Stack

- React + TanStack Router + TanStack Query (keep)
- Tailwind CSS (keep)
- restty (libghostty-vt + WebGPU) for terminal widget
- SSE via EventSource API for dashboard real-time
- WebSocket for terminal (on-demand)

### Pages

```
/                       Task list (active + pinned, grouped by project)
/tasks/:taskId          Task detail (status, timeline, git, terminal, history)
/tasks/:taskId/diff     Full diff view
/backlog                Backlog tasks
/projects               Project management
```

### Task Detail Sections

1. **StatusCard** — status badge, branch, file count, last activity, [Stop] [Approve]
2. **SessionTimeline** — session_events as reverse-chronological list
3. **GitSummary** — file list with +/- stats, expandable full diff
4. **TerminalWidget** — restty instance, collapsible, lazy WebSocket
5. **SessionHistory** — past sessions list (from sessions table)

## Worktree

Simplified from v1:

```
<project-local-path>/.banto/worktrees/<task-id>/
```

No slug generation. No custom path resolution. Branch: `banto/<task-id-first-8>`.

## Execution Flow

```
User taps "Start Session"
  │
  POST /api/tasks/:id/sessions
  │
  Server:
  ├─ INSERT sessions (status: starting)
  ├─ git worktree add
  ├─ Bun.spawn(["claude", prompt], {cwd: worktree, terminal})
  ├─ On first PTY output → status: running
  ├─ PTY output → ring buffer + event extractor + WS subscribers
  ├─ State transitions → UPDATE sessions + INSERT events + SSE push
  └─ On exit → status: done/failed, ended_at

  Client:
  ├─ SSE receives session_status → re-fetch task detail
  ├─ SSE receives session_event → append to timeline
  ├─ Terminal widget (if visible) connects WS → receives PTY stream
  └─ On done/failed → collapse terminal, show final status
```

## What to Delete from v1

```
src/client/sessions/ghostty-terminal-adapter.ts
src/client/sessions/ghostty-terminal-adapter.test.ts
src/client/sessions/terminal-adapter.ts
src/client/sessions/terminal-adapter-fake.ts
src/client/sessions/terminal-input-bridge.ts
src/client/sessions/terminal-input-bridge.test.ts
src/client/sessions/ime-controller.ts
src/client/sessions/ime-controller.test.ts
src/client/sessions/ime-fixtures.ts
src/client/sessions/TerminalView.tsx
src/client/types/ghostty-web.d.ts
src/server/sessions/slugify.ts
src/server/sessions/slugify.test.ts
src/server/session-logs/repository.ts
src/server/attachments/*
```

## Build Order

### Phase 1: Server (data model + observation)

1. Create sessions + session_events tables
2. Refactor runner.ts → new session lifecycle with state machine
3. Event extractor (PTY output → session_events)
4. SSE endpoint (/api/events)
5. New session API endpoints
6. Remove session columns from tasks table
7. Remove session_logs table

### Phase 2: Frontend (structured views)

1. StatusCard component
2. SessionTimeline component (SSE-driven)
3. GitSummary component
4. SessionHistory component
5. Integrate restty as terminal widget
6. Mobile layout + touch
7. Delete ghostty-web, IME, terminal-adapter, input-bridge

### Phase 3: Polish

1. Visibility-aware WebSocket (connect/disconnect on scroll)
2. Permission approval button (sends input via /api/sessions/:id/input)
3. Diff view page (/tasks/:taskId/diff)
4. Touch gesture refinement
