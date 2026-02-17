## 1. Schema Migration & Types

- [x] 1.1 Update `applySchema` in `db.ts`: add 5 session columns to `tasks` (`session_status`, `worktree_path`, `branch`, `session_started_at`, `session_error`), create `session_logs` table, drop `sessions` table, drop `messages` table, drop `todos` column from `tasks`
- [x] 1.2 Update `shared/types.ts`: replace `Session`/`Message`/`TodoItem` types with new `Task` interface (includes session fields) and `SessionLog` interface. Update `TaskStatus` and add `SessionStatus` type
- [x] 1.3 Update `tasks/repository.ts` to read/write new session columns on the task entity
- [x] 1.4 Create `session-logs/repository.ts` with insert and query-by-task functions

## 2. PTY Session Runner (Server)

- [x] 2.1 Create `sessions/pty-store.ts`: in-memory ring buffer per task (1MB default), pub/sub for WebSocket subscribers, stdin forwarding, buffer clear on archive
- [x] 2.2 Create `sessions/runner.ts`: `startSession(taskId)` with `BEGIN IMMEDIATE` guard, worktree creation, `Bun.Terminal` + `Bun.spawn` lifecycle, status transitions (pending → provisioning → running → done/failed)
- [x] 2.3 Add `archiveSession(taskId)` to runner: SIGTERM/SIGKILL PTY, clear ptyStore, archive to `session_logs`, reset task session fields, cleanup worktree — all in transaction
- [x] 2.4 Add server startup recovery in `server.ts` or `db.ts`: find orphaned active sessions, archive as failed with `error = 'server restart'`, reset fields

## 3. API Routes (Server)

- [x] 3.1 Add `POST /api/tasks/:id/session/start` route: validate task status, call `startSession`
- [x] 3.2 Add `POST /api/tasks/:id/session/retry` route: call `archiveSession` then `startSession`
- [x] 3.3 Add `WS /api/tasks/:id/terminal` route: subscribe to ptyStore, send replay buffer, pipe binary frames (stdout) and text frames (stdin)
- [x] 3.4 Add `POST /api/tasks/:id/terminal/resize` route: validate session active, call `terminal.resize(cols, rows)`
- [x] 3.5 Add `GET /api/tasks/:id/session-logs` route: query `session_logs` by task_id
- [x] 3.6 Remove old session routes (`/api/sessions`, `/api/sessions/:id/logs/stream`, etc.)
- [x] 3.7 Update task routes to include session fields in task responses

## 4. Client: Terminal Renderer

- [x] 4.1 Add `ghostty-web` dependency and configure async WASM loading
- [x] 4.2 Create `sessions/TerminalView.tsx`: ghostty-web init, WebSocket connection to `/api/tasks/:id/terminal`, `term.onData` → `ws.send`, `ws.onmessage` → `term.write`, resize observer → `POST resize`
- [x] 4.3 Handle terminal states: show terminal for active/done/failed sessions, disable stdin for done/failed, show error state on WASM load failure
- [x] 4.4 Delete `sessions/SessionChatPanel.tsx` and `sessions/ChatMessage.tsx`

## 5. Client: TaskInfoPanel & Queries

- [x] 5.1 Update `tasks/queries.ts`: remove session queries (`sessionQueries.byTask`), add `useStartSession` and `useRetrySession` mutations pointing to new endpoints
- [x] 5.2 Update `sessions/queries.ts` or remove: replace with session-log queries if needed
- [x] 5.3 Update `sessions/api.ts`: replace session API calls with task-scoped endpoints (`/api/tasks/:id/session/start`, `/api/tasks/:id/session/retry`)
- [x] 5.4 Simplify `TaskInfoPanel.tsx`: read `task.sessionStatus` directly (no separate session fetch), remove "Agent Todo" section, show "Start Session" when `sessionStatus = null && status = active`, show "Retry" when `sessionStatus` is `done`/`failed`, render `TerminalView` when session exists

## 6. Cleanup

- [x] 6.1 Remove `sessions/agent.ts`, `sessions/container.ts`, `sessions/log-store.ts` (Agent SDK code)
- [x] 6.2 Remove `@anthropic-ai/claude-agent-sdk` and `@anthropic-ai/sdk` dependencies
- [x] 6.3 Remove `Message`-related server code (repository, service if any)
- [x] 6.4 Update `tasks/api.ts` response types to match new `Task` interface
