## Context

banto currently runs Claude Code via the Agent SDK (`@anthropic-ai/claude-agent-sdk`), which emits structured messages (text blocks, tool names, status). These are pushed into an in-memory `logStore`, streamed to the client over SSE, and rendered as styled `<div>` elements in `SessionChatPanel` + `ChatMessage`.

This approach loses the native Claude Code CLI experience — colors, spinners, interactive prompts, and TUI layout are all stripped. The nixos-container approach was explored in `spike/` but abandoned because each container requires its own OAuth session.

The new approach: spawn Claude Code CLI directly on the host as a PTY process, stream raw terminal data to the browser over WebSocket, and render it with a proper terminal emulator.

### Key technology choices already made:
- **Bun `Bun.Terminal` API** (v1.3.5+) for PTY spawning — zero additional server deps
- **ghostty-web** (by Coder) for browser-side terminal rendering — xterm.js-compatible API, ~400KB WASM, MIT licensed
- **Elysia WebSocket** for bidirectional PTY ↔ browser relay

## Goals / Non-Goals

**Goals:**
- Full-fidelity Claude Code CLI rendering in the browser (colors, cursor, TUI layout)
- Bidirectional terminal: stdin input from browser reaches the PTY (enables `waiting_for_input`)
- Retain worktree isolation per session
- Retain session state machine (pending → provisioning → running → done/failed)
- Drop-in replacement for the current Agent SDK path — no changes to task/project/attachment domains

**Non-Goals:**
- Multi-user terminal sharing or collaboration
- Terminal session persistence across server restarts (PTY is ephemeral)
- GPU-accelerated rendering via WebGPU (ghostty-web canvas renderer is sufficient)
- Replacing the session state machine with a PTY-only model
- Windows support (Bun.Terminal is POSIX-only, NixOS is the target)

## Decisions

### 1. PTY spawning: `Bun.Terminal` API

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
    ptyStore.push(sessionId, data);
  },
  exit() {
    // session completed
  },
});

const proc = Bun.spawn(["claude"], {
  cwd: worktreePath,
  env: { ...process.env, CLAUDE_CODE_EXECUTABLE: undefined },
  terminal,
});
```

### 2. Browser terminal: ghostty-web

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

const ws = new WebSocket(`/api/sessions/${sessionId}/terminal`);
term.onData((data) => ws.send(data));       // stdin: browser → PTY
ws.onmessage = (e) => term.write(e.data);   // stdout: PTY → browser
```

### 3. Transport: WebSocket (not SSE)

**Choice**: Replace SSE (`/api/sessions/:id/logs/stream`) with WebSocket (`/api/sessions/:id/terminal`).

**Alternatives considered**:
- Keep SSE for output + separate POST for input: Simpler server, but two connections per session and awkward latency for interactive input.
- WebTransport: Better for high-throughput binary, but browser support is limited and overkill for this use case.

**Rationale**: WebSocket is inherently bidirectional — one connection handles both PTY output and stdin input. Elysia has built-in WebSocket support. SSE is write-only and would require a separate channel for stdin.

### 4. Data format: Raw binary (not JSON-wrapped)

**Choice**: Stream raw PTY bytes over WebSocket as binary frames.

**Alternatives considered**:
- JSON wrapping (`{ type: "output", data: "..." }`): Adds overhead, requires encode/decode on every frame, and ghostty-web expects raw terminal data anyway.
- Protocol buffer framing: Overkill for a single data stream.

**Rationale**: ghostty-web's `term.write()` accepts raw terminal data. The PTY emits raw bytes. Passing them through without transformation is the simplest and fastest path. Control messages (resize, session state) use a separate JSON text frame channel on the same WebSocket.

### 5. PTY data store: Replace logStore with ptyStore

**Choice**: Replace the structured `logStore` (text/tool/error/status entries) with a `ptyStore` that buffers raw PTY output bytes per session.

**Design**:
- Buffer the last N bytes (e.g., 1MB) per session for replay when a client reconnects mid-session
- New WebSocket connections receive the buffered output first, then live data
- The `ptyStore` also manages subscriber sets per session (same pub/sub pattern as logStore)

### 6. Session lifecycle integration

The runner creates a `Bun.Terminal`, spawns Claude Code CLI, and integrates with the existing session state machine:

```
start() → pending
  ↓
createWorktree() + Bun.Terminal + Bun.spawn → provisioning
  ↓
first PTY data received → running
  ↓
process exits with code 0 → done
process exits with non-zero → failed
```

The `waiting_for_input` state becomes achievable: the PTY stdin is always open, so the user can type into the terminal at any time. Detection of when Claude Code is actually waiting can be done later via output pattern matching.

### 7. Terminal resize

The client sends resize events (`{ type: "resize", cols, rows }`) as JSON text frames on the WebSocket. The server calls `terminal.resize(cols, rows)` on the `Bun.Terminal` instance.

## Risks / Trade-offs

**[Bun.Terminal API stability]** → Bun.Terminal was introduced in v1.3.5 (Dec 2025). API may change in future Bun versions. Mitigation: Pin Bun version in flake.nix. The API surface is small enough to adapt quickly.

**[ghostty-web maturity]** → ghostty-web is early-stage. Some terminal features may have edge cases. Mitigation: It's xterm.js API-compatible, so fallback to xterm.js is a one-line import change.

**[No session replay after server restart]** → PTY buffer is in-memory only. If the server restarts, active session output is lost. Mitigation: This matches current behavior (logStore is also in-memory). Future improvement: persist PTY output to disk.

**[Binary WebSocket frame size]** → Large bursts of terminal output (e.g., `cat` of a big file) could flood the WebSocket. Mitigation: ghostty-web handles rendering efficiently; Elysia WebSocket has backpressure support.

**[Claude Code CLI version coupling]** → We depend on the CLI being installed on the host and behaving as a standard terminal application. Mitigation: Already the case with the current `CLAUDE_CODE_EXECUTABLE` approach. PTY is actually more robust than the Agent SDK since it just needs a binary that runs in a terminal.

## Open Questions

- **ghostty-web SSR/bundling**: How does ghostty-web's WASM initialization interact with Bun's bundler for the client build? May need to load WASM asynchronously.
- **Terminal dimensions**: Should the server dictate terminal size, or should the client negotiate on connect? Leaning toward client-driven resize.
- **Multiple viewers**: If two browser tabs open the same session, should both see live output? Current design supports this via the pub/sub ptyStore, but input from multiple sources could conflict.
