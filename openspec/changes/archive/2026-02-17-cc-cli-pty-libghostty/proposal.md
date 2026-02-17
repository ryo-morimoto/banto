## Why

The current Agent SDK approach streams structured text logs over SSE, losing the native Claude Code CLI terminal experience (colors, layout, interactive input). The nixos-container approach requires OAuth per session, making it unusable as an ambient agent. The data model has unnecessary indirection — `sessions` is a separate 1:N entity when in practice only one session is ever active per task, and past sessions are just logs.

By spawning Claude Code CLI as a PTY process on the host, rendering it with ghostty-web in the browser, and simplifying the data model to promote the active session into the task itself, we deliver the full CLI-fidelity "jot, throw, watch" experience with a minimal entity model.

## What Changes

- **BREAKING**: Remove Agent SDK (`@anthropic-ai/claude-agent-sdk`) and replace with direct PTY spawn of Claude Code CLI
- **BREAKING**: Replace SSE log streaming with WebSocket-based pure PTY pipe (`/api/tasks/:id/terminal`)
- **BREAKING**: Replace `SessionChatPanel` + `ChatMessage` structured log display with ghostty-web terminal rendering
- **BREAKING**: Drop `sessions` table — active session state promoted into `tasks` table
- **BREAKING**: Drop `messages` table — PTY terminal output replaces structured logs
- **BREAKING**: Drop `todos` column — terminal is SSoT for agent state
- **BREAKING**: Session-scoped API endpoints (`/api/sessions/...`) replaced with task-scoped endpoints (`/api/tasks/:id/session/...`)
- Add `session_logs` table for cold metadata archive of past sessions
- Add server startup recovery for orphaned sessions
- Abandon nixos-container spike code and design direction (OAuth blocker)
- Retain worktree isolation (worktree creation/cleanup stays as-is)
- Enable `waiting_for_input` state via PTY stdin input

## Capabilities

### New Capabilities

- `pty-session-runner`: Spawn Claude Code CLI using Bun's built-in PTY API (`Bun.Terminal` + `Bun.spawn`) and manage PTY lifecycle per task. Includes worktree execution, process lifecycle management, stdin input forwarding, race-safe session start (`BEGIN IMMEDIATE` guard), teardown sequence (SIGTERM → archive → cleanup), and server restart recovery
- `pty-websocket-stream`: Pure PTY WebSocket pipe — forward PTY stdout as binary frames to the client, pipe client stdin back to the PTY. No protocol mixing; resize and session state use separate REST endpoints
- `terminal-renderer`: Embed ghostty-web in the browser to render PTY data from the WebSocket with native-quality terminal display

### Modified Capabilities

None (no existing specs)

## Impact

- **Removed deps**: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`
- **Added deps**: `ghostty-web` (client-side terminal rendering, ~400KB WASM, MIT). No server-side deps added — PTY is built into Bun
- **Schema changes**:
  - `tasks` table gains 5 nullable session columns (`session_status`, `worktree_path`, `branch`, `session_started_at`, `session_error`)
  - `tasks` table loses `todos` column
  - New `session_logs` table (cold metadata)
  - Drop `sessions` table
  - Drop `messages` table
- **Server changes**: `sessions/` domain directory restructured — `agent.ts` replaced by PTY runner, `log-store.ts` replaced by `ptyStore`, `routes.ts` rewritten from session-scoped to task-scoped endpoints, `container.ts` removed
- **Client changes**: `sessions/SessionChatPanel.tsx` → full rewrite to ghostty-web terminal component, `sessions/ChatMessage.tsx` → deleted, `tasks/TaskInfoPanel.tsx` simplified (no separate session queries, no Agent Todo section)
- **API surface**: Session endpoints collapse into task-scoped routes. WebSocket carries only PTY data; resize via REST
- **spike/ directory**: nixos-container spikes kept as reference but removed from development direction
- **Build**: ghostty-web WASM loaded asynchronously on client
