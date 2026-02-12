## Why

The current Agent SDK approach streams structured text logs over SSE, losing the native Claude Code CLI terminal experience (colors, layout, interactive input). The nixos-container approach requires OAuth per session, making it unusable as an ambient agent. By spawning Claude Code CLI as a PTY process on the host and rendering it with libghostty in the browser, we deliver the full CLI-fidelity "throw it and watch" experience.

## What Changes

- **BREAKING**: Remove Agent SDK (`@anthropic-ai/claude-agent-sdk`) and replace with direct PTY spawn of Claude Code CLI
- **BREAKING**: Replace SSE log streaming (`/api/sessions/:id/logs/stream`) with WebSocket-based PTY data streaming
- **BREAKING**: Replace `SessionChatPanel` + `ChatMessage` structured log display with libghostty-based terminal rendering
- Abandon nixos-container spike code and design direction (OAuth blocker)
- Retain worktree isolation (runner.ts worktree creation/cleanup stays as-is)
- Retain session state machine (pending → provisioning → running → done/failed)
- Enable `waiting_for_input` state via PTY stdin input

## Capabilities

### New Capabilities

- `pty-session-runner`: Spawn Claude Code CLI using Bun's built-in PTY API (`Bun.spawn` with `pty: true`) and manage PTY output per session. Includes execution within worktrees, process lifecycle management, and stdin input forwarding
- `pty-websocket-stream`: Bidirectional WebSocket relay — forward PTY stdout/stderr as binary stream to the client, and pipe client stdin input back to the PTY
- `terminal-renderer`: Embed libghostty in the browser to render PTY data from the WebSocket with native-quality terminal display

### Modified Capabilities

None (no existing specs)

## Impact

- **Removed deps**: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`
- **Added deps**: libghostty (client-side terminal rendering, WASM or C FFI). No server-side deps added — PTY is built into Bun
- **Server changes**: `sessions/agent.ts` → replaced by new PTY runner, `sessions/log-store.ts` → replaced by PTY data buffer, `sessions/routes.ts` SSE endpoint → WebSocket endpoint
- **Client changes**: `sessions/SessionChatPanel.tsx` → full rewrite to libghostty terminal component, `sessions/ChatMessage.tsx` → deleted
- **spike/ directory**: nixos-container spikes kept as reference but removed from development direction
- **Build**: libghostty WASM build or native binding build pipeline required
