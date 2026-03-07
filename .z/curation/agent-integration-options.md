# Agent Integration Options — Full Landscape (Unfiltered)

Date: 2026-03-07
Status: Curated options before constraint filtering. No recommendations.

## Target Agents

| Agent | Language | Non-Interactive | Native Protocol | ACP | Hooks | MCP | TUI |
|-------|----------|----------------|-----------------|-----|-------|-----|-----|
| Claude Code | TypeScript | `claude -p` stream-json | stream-json (bidirectional) | Yes | 17 events (HTTP/command) | Full + permission-prompt-tool | Ink |
| OpenCode | Go | `opencode -p` (single-shot) | None | Yes | None | Yes (stdio, HTTP) | Bubble Tea |
| Codex (OpenAI) | Rust | `codex exec --json` (JSONL) | app-server JSON-RPC 2.0 | Yes | notify (turn complete) | Yes (stdio, Streamable HTTP) | Ratatui |
| Gemini CLI | TypeScript | Yes | Unknown | Yes | Unknown | Yes | Yes |
| Goose | Rust | Yes | Unknown | Yes | Unknown | Yes | Yes |
| Kiro (AWS) | Unknown | Unknown | Unknown | Yes | Unknown | Yes | Unknown |
| Copilot CLI | TypeScript | Unknown | Unknown | Yes | Unknown | Yes | Yes |

---

## A. Spawn Methods

### A1. Non-Interactive Mode (Headless)

Agent runs as a child process with no terminal allocation. Prompt via CLI arg or stdin, output via stdout.

| Agent | Command | Output Format | Multi-Turn | Follow-Up |
|-------|---------|--------------|------------|-----------|
| Claude Code | `claude -p "prompt" --output-format stream-json --session-id <uuid>` | JSONL events (real-time) | Via `--input-format stream-json` on stdin | `claude -p --continue --session-id <uuid> "msg"` |
| OpenCode | `opencode -p "prompt" -f json -q` | JSON `{"response":"..."}` (final only) | No | No |
| Codex | `codex exec --json "prompt"` | JSONL events (real-time) | No (fire-and-forget) | No |

**Pros:** Simplest to implement. Process lifecycle = session lifecycle. No PTY complexity. Structured output available (CC, Codex).
**Cons:** No terminal UI for user. OpenCode is single-shot only. No mid-session interaction for Codex exec mode.
**Who uses this:** gob (stdout to log files, no terminal)

### A2. Structured Protocol Server

Agent runs a JSON-RPC or similar server. Orchestrator communicates via typed messages.

#### A2a. Agent-Native Protocols

| Agent | Protocol | Transport | Capabilities |
|-------|----------|-----------|-------------|
| Claude Code | stream-json | stdin/stdout | Bidirectional message passing, session management |
| Codex | JSON-RPC 2.0 | stdio or WebSocket | Thread create/resume/fork, turn control, approval handling, event streaming, config read/write |
| OpenCode | N/A | N/A | No native protocol server |

**Pros:** Richest control surface per agent. Typed events. Bidirectional. Codex app-server is what VS Code uses.
**Cons:** Agent-specific implementation per protocol. OpenCode has no native protocol.

#### A2b. ACP (Agent Client Protocol) — Universal

| Aspect | Detail |
|--------|--------|
| Protocol | JSON-RPC 2.0 over stdio |
| Spec | v0.11.0 |
| SDKs | Rust, TypeScript, Python, Kotlin |
| Compatible agents | Claude Code, Codex, OpenCode, Gemini CLI, Goose, Kiro, Copilot |

**Pros:** Single implementation covers all ACP-compatible agents. No agent-specific code needed. Growing ecosystem.
**Cons:** Less granular than native protocols. Newer, less battle-tested. May not expose all agent-specific features.
**Who uses this:** Zed editor, Neovim (via plugin), JetBrains (coming)

### A3. PTY Subprocess (Direct)

Agent runs in a pseudo-terminal allocated by banto. banto reads PTY output and writes PTY input.

| Runtime | API | Notes |
|---------|-----|-------|
| Bun.Terminal | `Bun.spawn({ terminal: { cols, rows, data(term, d), exit(term, code) } })` | Zero-dependency, POSIX-only, built into Bun v1.3.5+ |
| node-pty | `spawn(file, args, opts)` -> `onData`, `write()`, `resize()`, `kill()` | Battle-tested (VS Code uses it), native C++ addon |
| expect-like (spectcl) | Pattern matching on PTY output | Pre-v1.0, thin wrapper over node-pty |

**Pros:** Full terminal UI visible to user (relay to browser via WebSocket + xterm.js/ghostty-web). Works with any CLI agent. Supports mid-session interaction via PTY write.
**Cons:** Output is raw ANSI escape sequences — parsing for state detection is fragile. Agent-specific heuristics needed.
**Who uses this:** superset (node-pty + daemon), Crystal (node-pty + Electron), AgentOS (node-pty for browser terminal)

### A4. tmux Session

Agent runs inside a tmux session. Orchestrator controls via tmux CLI commands.

| Operation | tmux Command |
|-----------|-------------|
| Spawn | `tmux new-session -d -s <name> "claude ..."` |
| Read output | `tmux capture-pane -t <name> -p` |
| Send input | `tmux send-keys -t <name> "message" Enter` |
| Send large input | `tmux load-buffer -` + `tmux paste-buffer -t <name>` |
| Attach (interactive) | `tmux attach -t <name>` |
| Kill | `tmux kill-session -t <name>` |
| Control mode | `tmux -C` (text protocol with `%begin`/`%end`/`%output` events) |

**Pros:** Sessions survive server restarts (tmux persists). Proven pattern (6+ tools use it). Human can attach directly. No Bun/Node dependency for session persistence.
**Cons:** Extra dependency. `capture-pane` polling is fragile (100ms-2s intervals). `send-keys` has no acknowledgment. Shell escaping issues. `tmux kill-server` destroys everything.
**Who uses this:** claude-squad, agent-deck, codex-orchestrator, AgentOS, multi-agent-shogun

### A5. Container Isolation

Agent runs inside an isolated container. Orchestrator manages container lifecycle.

| Runtime | Type | Startup | Isolation |
|---------|------|---------|-----------|
| nixos-container | OS-level (systemd-nspawn) | ~seconds | Filesystem, network, process namespace |
| Docker | Container | ~seconds | Full (Bubblewrap, seccomp on Linux) |
| microvm.nix (Firecracker) | microVM | ~125ms | Hardware-level (KVM) |
| Codex built-in sandbox | Bubblewrap + Landlock + seccomp | Instant (in-process) | Filesystem + network ACLs |

**Pros:** Strongest isolation. Prevents agent from affecting host. Reproducible environments.
**Cons:** Higher startup latency. Complexity. Need to attach PTY/stdio through container boundary.
**Who uses this:** praktor (Docker + NATS), OpenHands (Docker/K8s), Codex (built-in sandbox)

### A6. systemd User Service

Agent runs as a systemd user service. Lifecycle managed by systemd.

```
systemd-run --user --unit=banto-session-<uuid> -- claude -p "prompt"
```

**Pros:** Automatic resource limits (CPUQuota, MemoryMax). journald log capture for free. Restart policies. Survives user logout (with lingering).
**Cons:** No PTY allocation (services don't have terminals). Requires combining with another method for terminal UI.
**Who uses this:** No known agent orchestrator uses this directly.

### A7. GNU Screen

Similar to tmux but with fewer programmatic control capabilities.

**Pros:** Available everywhere. Simpler than tmux.
**Cons:** No control mode protocol. No async notifications. Declining ecosystem (RHEL 8+ dropped it). Strictly inferior to tmux for programmatic use.
**Who uses this:** No known agent orchestrator prefers Screen over tmux.

### A8. Agent-as-Library (Embedding)

Import agent as a library instead of spawning a process.

| Agent | Library | Notes |
|-------|---------|-------|
| Claude | @anthropic-ai/claude-agent-sdk | ToS prohibits external service use |
| OpenHands | Agent SDK (Python) | Full event-sourced model, workspace abstraction |
| Codex | codex-core (Rust crate) | `submit(Op)`, `next_event()`, rich typed API |

**Pros:** Cleanest integration. Typed events. No PTY parsing. Full control.
**Cons:** Claude Agent SDK blocked by ToS. Different billing model (API tokens vs CLI subscription). No terminal UI. Language boundary (Rust crate from TypeScript).
**Who uses this:** praktor (Agent SDK inside Docker containers), OpenHands (SDK in-process)

---

## B. State Detection Methods

### B1. Agent Hooks (Push)

Agent pushes state change events to orchestrator.

| Agent | Hook Types | Transport | Events |
|-------|-----------|-----------|--------|
| Claude Code | command, HTTP, prompt, agent | Shell exec or HTTP POST | SessionStart, SessionEnd, Notification (idle_prompt, permission_prompt), Stop, PreToolUse, PostToolUse (17 total) |
| Codex | notify command | Shell exec (fire-and-forget) | AgentTurnComplete only |
| OpenCode | None | N/A | N/A |

**Pros:** Structured, high confidence, real-time. Claude Code's HTTP hooks can POST directly to banto's Elysia API.
**Cons:** Agent-specific configuration required. OpenCode has no hooks. Codex hooks are minimal (turn complete only).
**Who uses this:** superset (hook-to-HTTP), vde-monitor (hook-to-JSONL-file)

### B2. Structured Event Stream (Pull/Stream)

Read structured events from agent's stdout or protocol.

| Agent | Method | Events |
|-------|--------|--------|
| Claude Code | `--output-format stream-json` stdout | Message, tool use, result, error, metadata |
| Codex | `exec --json` stdout or app-server events | TurnStarted, TurnComplete, ExecCommandBegin/End, Error, TokenCount |
| OpenCode | N/A | N/A |

**Pros:** Rich, typed events. No configuration needed (just read stdout). Real-time.
**Cons:** Only available in non-interactive / protocol mode. Not available for OpenCode.

### B3. PTY Output Parsing (Pull)

Parse raw terminal output for state indicators.

| Method | Polling | Detection |
|--------|---------|-----------|
| tmux capture-pane | 100ms-2s | String/regex matching for prompts, errors, status |
| Direct PTY onData | Real-time | ANSI parsing + pattern matching |
| Screen fingerprinting | Variable | SHA-256 hash comparison of rendered screen |

**Pros:** Works with any CLI agent. No agent configuration needed.
**Cons:** Fragile — breaks when CLI updates change output format. Agent-specific patterns. False positives/negatives.
**Who uses this:** claude-squad (capture-pane + SHA-256), agent-deck (capture-pane + patterns), codex-orchestrator (log file scanning), vde-monitor (as fallback layer)

### B4. Filesystem Polling

Read agent's own data files for state.

| Agent | Files | Data |
|-------|-------|------|
| Claude Code | `~/.claude/tasks/<id>/tasks.json` | Task status, dependencies |
| Claude Code | transcript JSONL (path from hook data) | Full conversation history |
| OpenCode | `.opencode/opencode.db` (SQLite) | Sessions, messages, files |
| Composio | Claude's session files directly | Activity detection |

**Pros:** No agent configuration needed. Works even if hooks aren't available. SQLite polling for OpenCode.
**Cons:** Polling interval introduces latency. File format is agent-internal (may change without notice). No real-time events.
**Who uses this:** Composio (Claude session files), vde-monitor (JSONL tailing)

### B5. MCP Tool Callbacks

Agent calls banto-provided MCP tools during execution, reporting state as a side effect.

| Agent | MCP Support | permission-prompt-tool |
|-------|------------|----------------------|
| Claude Code | Full | Yes — intercepts ALL permission decisions |
| OpenCode | Yes (stdio, HTTP) | No equivalent found |
| Codex | Yes (stdio, Streamable HTTP) | No equivalent found |

**Pros:** Structured, semantic data. Cross-agent compatible. `--permission-prompt-tool` gives complete permission control for CC.
**Cons:** Agent calls tools at LLM's discretion — no guaranteed heartbeat. Not a replacement for hooks/polling.
**Who uses this:** No known orchestrator uses MCP as primary state channel yet.

### B6. Process-Level Monitoring

OS-level process observation.

| Method | Data |
|--------|------|
| Process existence (kill -0 pid) | Alive/dead |
| /proc/<pid>/stat | CPU, memory, state |
| SIGSTOP/SIGCONT | Pause/resume |
| SIGTERM/SIGINT | Graceful/forced stop |
| Exit code | Success/failure |

**Pros:** Universal. Zero configuration. Reliable for lifecycle boundaries.
**Cons:** No semantic information (running doesn't mean "thinking" vs "waiting for input").
**Who uses this:** gob (IsProcessRunning + stuck detection), all tools implicitly

### B7. Hybrid Multi-Layer (Confidence-Based)

Combine multiple methods with explicit confidence levels.

```
Layer 1: Hook events        -> High confidence
Layer 2: Structured stream  -> High confidence
Layer 3: MCP callbacks      -> Medium confidence (LLM-dependent)
Layer 4: PTY output parsing -> Medium confidence (heuristic)
Layer 5: Filesystem polling  -> Low confidence (latency)
Layer 6: Process monitoring  -> Low confidence (no semantics)
Layer 7: Screen fingerprint  -> Fallback (last resort)
```

**Who uses this:** vde-monitor (hooks + polling + fingerprinting with confidence levels)

---

## C. Control / Message Methods

### C1. Structured Protocol Messages

| Agent | Method | Mid-Session | Acknowledgment |
|-------|--------|------------|----------------|
| Claude Code | `--input-format stream-json` stdin | Yes | Via output events |
| Claude Code | `claude -p --continue --session-id <uuid> "msg"` | Sequential turns | Exit code |
| Codex | app-server `turn/start` JSON-RPC | Yes | JSON-RPC response |
| OpenCode | N/A | No | N/A |

### C2. PTY Input Write

Write directly to agent's PTY stdin.

**Pros:** Works with any agent in interactive mode. Natural — same as user typing.
**Cons:** No acknowledgment. Shell escaping needed. Can corrupt agent state if sent at wrong time.

### C3. tmux send-keys

Inject keystrokes into tmux session.

**Pros:** Works with any agent. Survives server restart (tmux persists).
**Cons:** No acknowledgment. 0.3s delay recommended before Enter. Shell escaping issues. Large input needs `load-buffer`.
**Who uses this:** claude-squad, agent-deck, codex-orchestrator, multi-agent-shogun

### C4. MCP Permission Control

`--permission-prompt-tool` delegates all permission decisions to banto.

**Pros:** Structured permission requests with tool_name + input. Can modify inputs (`updatedInput`). Complete control over what agent executes.
**Cons:** Claude Code only. Other agents have no equivalent.

### C5. Process Signals

| Signal | Effect | Reversible |
|--------|--------|-----------|
| SIGSTOP | Freeze process | Yes (SIGCONT) |
| SIGCONT | Resume process | N/A |
| SIGINT | Graceful interrupt | Depends on handler |
| SIGTERM | Graceful termination | No |
| SIGKILL | Forced termination | No |

**Pros:** Universal. Immediate. OS-guaranteed.
**Cons:** No semantic meaning. Agent may not handle signals gracefully.

### C6. Filesystem Command Files

Write command files that agent watches (or orchestrator triggers via signal).

**Who uses this:** multi-agent-shogun (YAML inbox files + inotifywait), Claude Code tasks (filesystem-based)

### C7. NATS / Message Bus

Structured pub/sub messaging between orchestrator and agents.

**Who uses this:** praktor (embedded NATS), Zeroshot (SQLite pub/sub)

---

## D. Terminal Relay to Browser

### D1. WebSocket + xterm.js

Industry standard. PTY output -> WebSocket -> xterm.js renderer in browser.

| Aspect | Detail |
|--------|--------|
| Maturity | Production-proven (VS Code, Codespaces, ttyd, Render, Railway) |
| Renderers | DOM (default), WebGL2 (addon, ~5-45x faster), Canvas (fallback) |
| Addons | fit, serialize, search, image (sixel/iTerm2/kitty), ligatures, unicode11, webgl |
| Flow control | Built-in watermark-based backpressure (highWater/lowWater thresholds) |
| Bundle | ~200KB (core), ~400KB with WebGL + fit |
| Performance | WebGL2 renderer handles high-throughput output well. DOM renderer struggles with >1000 lines/sec |
| Limitations | Ligature addon has performance overhead. No native WebGPU renderer. IME support via composition events (works but not native-feeling) |

**Pros:** Largest ecosystem. Best documented. Extensive addon system. Battle-tested at scale.
**Cons:** Not the best rendering quality. WebGL2 (not WebGPU). Large API surface.
**Who uses this:** AgentOS, marc-nuri-dashboard, ttyd, VS Code web, most web terminal tools

### D2. WebSocket + restty

libghostty-vt (WASM) + WebGPU renderer + text-shaper + built-in IME/touch.

| Aspect | Detail |
|--------|--------|
| Maturity | Early release (February 2026). 272 GitHub stars. Single maintainer (wiedymi). |
| Renderer | WebGPU primary, WebGL2 fallback |
| VT engine | libghostty-vt via WASM (~400KB). Same parser as Ghostty desktop. |
| IME | Built-in (auto-generated hidden input element) |
| Touch | Pan-first scrolling, touch selection mode |
| Themes | 40+ themes (Ghostty format compatible) |
| Plugin system | Yes |
| Bundle | ~400KB WASM + renderer |
| API | Partial xterm.js shim (buffer/parser/marker not implemented) |
| Limitations | Early. Kitty image protocol unstable. Incomplete xterm.js compat. text-shaper details unclear. |

**Pros:** Ghostty-quality VT parsing. WebGPU rendering. Built-in IME/touch (fixes ghostty-web's issues). Plugin system.
**Cons:** Single maintainer risk. Early stage. API may change.
**Chosen for banto v2.** Server-side architecture is identical to xterm.js — swap is possible later.

### D3. WebSocket + ghostty-web (Coder)

Ghostty VT engine compiled to WASM, xterm.js drop-in API, Canvas 2D renderer.

| Aspect | Detail |
|--------|--------|
| Maturity | Early. Used in banto v1. |
| Renderer | Canvas 2D only (dirty-row). No GPU acceleration. |
| Bundle | ~400KB WASM |
| Known issues (banto v1) | IME broken (required custom ime-controller.ts). Resize broken (required custom FitAddon). ANSI colors required explicit theme passing. Input handling issues. |

**Pros:** Ghostty VT parsing quality. xterm.js compatible API.
**Cons:** Canvas-only (no GPU). IME/resize/input broken in practice. Relies on ghostty-web-specific patches. Being replaced in banto v2.

### D4. Server-Side VT Parsing + Structured UI

Parse VT sequences on the server. Send structured "screen state" or rendered HTML to browser instead of raw ANSI.

| Library | Language | Capabilities |
|---------|----------|-------------|
| vt100 (Rust crate) | Rust | Full VT parser + screen state. Read cells, cursor position, scrollback. |
| vte (Alacritty) | Rust | Low-level VT parser. No screen state management. |
| @xterm/headless | JS | Full xterm.js without DOM. Server-side terminal state. |
| ansi_up | JS | ANSI -> HTML conversion. Simple, small. |
| terminal-to-html (Buildkite) | Go | ANSI -> HTML for CI output rendering. |

**Use cases:**
- **Observation layer**: Parse PTY output server-side to extract structured events (tool use, errors, permission requests) without relying on regex.
- **Reconnection replay**: Maintain server-side terminal state. On reconnect, send current screen state instead of replaying full scrollback.
- **Structured view for mobile**: Render agent output as styled HTML cards instead of full terminal emulation.
- **Session summary**: Extract meaningful text from terminal for notification content.

**Pros:** Rich semantic extraction. Better mobile experience. Enables non-terminal views.
**Cons:** Dual rendering overhead (server + client). Lossy for complex TUI output. Additional complexity.
**Who uses this:** vde-monitor (server-side state estimation), superset (headless for cold restore)

### D5. SSE / Structured Event Stream (No Terminal)

Server-Sent Events for structured agent output. No terminal emulation.

**Pros:** Simple. Low bandwidth. Works on mobile without terminal complexity. Good for notification/timeline views.
**Cons:** No interactive terminal. Cannot show TUI output. Text/card-only view.

### D6. No Terminal (Conversation View Only)

Show agent activity as structured cards/timeline/conversation, not terminal output.

**Pros:** Best mobile experience. Lowest complexity. Cleanest for review workflows.
**Cons:** Loses terminal interaction capability. Cannot show compilation output, test results in raw form.
**Who uses this:** Claude Code Remote Control (conversation only, no terminal), Happy Coder (structured message events)

### D7. asciinema Player (Session Replay)

Read-only replay of recorded terminal sessions.

| Aspect | Detail |
|--------|--------|
| Maturity | Established project. 3.x rewrite in Rust. |
| Live streaming | Supported (3.x). Real-time recording + playback. |
| Format | asciicast v2 (JSONL with timestamps) |
| Embedding | Standalone JS player. Embeddable in any web page. |

**Pros:** Excellent for session review/replay. Lightweight. Scrubbing/speed control. Live streaming support.
**Cons:** Read-only (no input). Separate from interactive terminal. Additional recording step needed.
**Use case for banto:** Complement interactive terminal for done/review sessions. Record sessions in asciicast format for later review.

### D8. Multiplexed WebSocket Protocol

Handle N terminal sessions over a single WebSocket connection.

| Approach | Description |
|----------|-------------|
| Per-session WebSocket | One WS connection per terminal. Simplest. |
| Channel multiplexing | Single WS with session-id framing. sockjs/websocket-multiplex pattern. |
| Binary framing | superset's Unix socket protocol: NDJSON for control + binary frames for terminal data. |

**For banto:** Per-session WebSocket is correct for the 1-active-terminal-at-a-time UX. The dashboard shows session cards; clicking opens one terminal. No need for multiplexing.

### D-arch. Server-Side Architecture (Terminal-Agnostic)

These server patterns are identical regardless of client renderer choice:

| Component | Pattern |
|-----------|---------|
| Ring buffer | 1MB per session. Replay on reconnect. |
| Flow control | Write callback + watermark thresholds. Drop frames under backpressure. |
| Visibility-aware WS | Connect on terminal expand (IntersectionObserver). Disconnect on collapse/tab hidden. |
| Throughput | Agent output is 1-50 KB/s typical. Well within any renderer's capability. |
| Reconnection | Replay ring buffer contents to new WebSocket connection. |

**Key insight:** Client renderer (xterm.js vs restty) is a swap-later-compatible decision. Server architecture is the same.

---

## E. Session Persistence & Crash Recovery

### E1. Process-Level (Ephemeral)

Session dies with process. No recovery.

### E2. tmux Persistence

Sessions survive server restart. tmux keeps process alive.
**Limitation:** tmux itself can crash. No reboot persistence without tmux-resurrect.

### E3. Event Ledger + Replay

Append-only event log in SQLite. Reconstruct state by replaying events.
**Who uses this:** OpenHands (event-sourced), gob (SQLite), Zeroshot (SQLite pub/sub)

### E4. Daemon with Instance ID

Server tracks `daemon_instance_id`. On restart, reconciles orphaned sessions.
**Who uses this:** gob (boot-time reconciliation)

### E5. Scrollback Persistence

Save terminal scrollback to disk. Cold restore shows history without re-running.
**Who uses this:** superset (512KB scrollback persistence, cold restore UI)

### E6. Agent Session Resume

Use agent's built-in resume capability after crash.

| Agent | Resume | Method |
|-------|--------|--------|
| Claude Code | Yes | `--resume <session-id>` or `--continue` |
| OpenCode | No | N/A |
| Codex | Yes | app-server thread resume, `codex exec --thread <id>` |

---

## F. Emerging Protocols

### F1. Agent Client Protocol (ACP) — "LSP for Agents"

| Aspect | Detail |
|--------|--------|
| Origin | Zed (editor). Designed as the universal protocol for editor-agent communication. |
| Spec version | v0.11.0 (March 2026) |
| Transport | JSON-RPC 2.0 over stdio |
| SDKs | Rust, TypeScript, Python, Kotlin |
| Supported agents | Claude Code, Codex, Gemini CLI, OpenCode, Goose, Kiro, Copilot |

**Capabilities:**
- Session lifecycle (initialize, shutdown)
- Message exchange (user -> agent, agent -> user)
- Tool use reporting (agent reports tool calls + results)
- Permission requests (agent asks client for approval)
- Progress/status events

**Relevance to banto:** If banto implements ACP client, it gets automatic support for every ACP-compatible agent without agent-specific code. This is the highest-leverage protocol for multi-agent support. However, ACP provides less granular control than agent-native protocols (CC stream-json, Codex app-server).

**Status:** Early but rapidly adopted. The "LSP for agents" framing has strong industry momentum.

### F2. Claude Code Agent SDK

| Aspect | Detail |
|--------|--------|
| Package | `@anthropic-ai/claude-agent-sdk` (TypeScript) |
| API | `query()` returns async generator streaming 17+ typed message events |
| Permission | `canUseTool` callback (allow/deny with modified input) |
| Hooks | 18 hook events covering full lifecycle |
| Session | Resume, fork, rewind |
| Custom spawn | Container/VM support via custom subprocess options |

**Relevance to banto:** Richest control surface of any coding agent. BUT ToS prohibits use by external services/tools. **Cannot use.**

### F3. Claude Code stream-json Protocol

| Aspect | Detail |
|--------|--------|
| Activation | `claude -p --output-format stream-json --input-format stream-json` |
| Output events | Message start/delta/stop, tool use, result, error, metadata (session_id, model, cost) |
| Input format | JSON messages on stdin (user messages, approval responses) |
| Session management | `--session-id <uuid>`, `--continue`, `--resume` |
| Permission handling | `--permission-prompt-tool` delegates to MCP tool |

**Relevance to banto:** The primary programmatic interface for Claude Code. Bidirectional, structured, real-time. Combined with HTTP hooks for lifecycle events and `--permission-prompt-tool` for permission control, this provides near-SDK-level integration without violating ToS.

**Limitations:** Less structured than Codex JSON-RPC (no formal method/response pairing). Input format documentation is sparse — partially reverse-engineered.

### F4. Codex app-server JSON-RPC 2.0

| Aspect | Detail |
|--------|--------|
| Activation | `codex app-server` (spawns JSON-RPC server over stdio) |
| Alternative | Experimental WebSocket transport |
| TypeScript types | Auto-generated via `codex app-server generate-ts` |

**RPC Methods:**
- `thread/start` — Create new thread with prompt
- `turn/start` — Send follow-up message
- `thread/list` — List threads
- `thread/fork` — Fork thread at a point
- `config/read` — Read current configuration
- Approval responses: accept, acceptForSession, decline, cancel

**Event Types:**
- TurnStarted, TurnComplete
- ExecCommandBegin, ExecCommandEnd
- PatchApply, Error, TokenCount
- AgentStatus (PendingInit, Running, Completed, Errored, Shutdown)

**Relevance to banto:** The richest agent control protocol available. Full thread lifecycle, bidirectional control, typed events. This is what VS Code uses. Auto-generated TypeScript types reduce integration effort.

### F5. MCP (Model Context Protocol) — Latest State

| Aspect | Detail |
|--------|--------|
| Spec | 2025-11-05 (latest stable) |
| Transport | Streamable HTTP (current standard). stdio (local). SSE (deprecated). |
| Auth | OAuth 2.1 (for remote servers; irrelevant for banto's local use) |

**Key capabilities for banto:**
- **banto as MCP server**: Expose tools (report_status, get_task_context, request_permission) that agents call during execution.
- **Elicitation**: Server can ask client (agent) for user input.
- **Sampling**: Server can request LLM completions from client.
- **Notifications**: Server can push resource changes, progress updates. Not guaranteed delivery.
- **Roots**: Client declares workspace roots.

**Limitations:** MCP is agent-driven (agent decides when to call tools). No guaranteed heartbeat. Cannot replace hooks for lifecycle events. Best as a complement.
**Supported by:** Claude Code (full), OpenCode (yes), Codex (yes)

### F6. A2A (Agent-to-Agent Protocol) — Google

| Aspect | Detail |
|--------|--------|
| Origin | Google DeepMind |
| Focus | Multi-agent coordination (enterprise, cloud) |
| Relevance | Low. Designed for cloud agent ecosystems, not local CLI agent orchestration. |

### F7. AG-UI (Agent-User Interaction Protocol)

| Aspect | Detail |
|--------|--------|
| Origin | CopilotKit |
| Focus | Streaming agent UI events to frontend |
| Event types | 16 standardized types (TextMessage, ToolCall, StateSnapshot, etc.) |
| Relevance | Design inspiration for banto's WebSocket event format, but coding agents don't implement it. |

### F8. W3C AI Agent Protocol

Specs expected 2026-2027. Too early.

### F9. LangGraph / AutoGen / CrewAI

Python-based multi-agent frameworks. Irrelevant to banto's CLI agent orchestration use case. No standardized protocol has emerged from these ecosystems.

### F-summary. Protocol Strategy Matrix

| Protocol | Claude Code | OpenCode | Codex | Priority |
|----------|-----------|----------|-------|----------|
| Agent-native (stream-json / app-server) | stream-json | N/A | JSON-RPC 2.0 | P0 — Primary agents |
| ACP | Supported | Supported | Supported | P1 — Universal fallback |
| MCP (banto as server) | Full | Yes | Yes | P2 — Tool exposure |
| Hooks (HTTP/command) | 17 events | None | notify only | P0 — Lifecycle events |
| Agent SDK | Richest | N/A | codex-core crate | Blocked (CC ToS) |

**Key insight:** No single protocol covers all agents equally. The competitive advantage is being the one dashboard that talks to each agent through its best available interface — native protocols for primary agents, ACP for universal compatibility, MCP for tool exposure.

---

## G. Competitor Implementation Map

| Tool | Spawn | State | Control | Terminal Relay | Persistence |
|------|-------|-------|---------|---------------|-------------|
| claude-squad | tmux | capture-pane polling | tmux send-keys | N/A (TUI) | tmux (ephemeral) |
| cmux | Native PTY (libghostty) | OSC + hooks + socket API | UDS JSON-RPC | N/A (native) | N/A (terminal) |
| gob | Daemon + process groups | Process polling + stuck detection | Signals only | N/A (TUI) | SQLite + instance ID |
| agent-deck | tmux | capture-pane patterns | tmux send-keys + conductor | WebSocket | tmux (ephemeral) |
| codex-orchestrator | tmux + script | Log file polling + markers | tmux send-keys | N/A | File-per-job |
| AgentOS | tmux + node-pty | tmux monitoring | tmux send-keys + WebSocket | WebSocket + xterm.js | SQLite |
| superset | Daemon + node-pty | HTTP hooks | Unix socket NDJSON | Electron IPC | Daemon + scrollback |
| praktor | Docker | NATS events | NATS pub/sub | N/A | SQLite + Docker volumes |
| vde-monitor | tmux/WezTerm (external) | Hooks + polling + fingerprint (confidence) | Multiplexer abstraction | WebSocket | JSONL files |
| multi-agent-shogun | tmux panes | inotifywait on YAML | PTY write + YAML files | N/A | YAML files |
| Crystal | node-pty + Electron | Git polling + IPC | IPC channels | Electron | Electron |
| Happy Coder | PTY or SDK mode | HTTP hook + WebSocket events | Socket.IO RPC | Socket.IO | SQLite |
| Zeroshot | CLI shell-out | SQLite pub/sub + self-report | Message bus topics | N/A | SQLite ledger |
| Composio | tmux/container plugin | Session file reading | Plugin interface | N/A | Plugin-dependent |
| OpenHands | Docker/K8s | Event-sourced WebSocket | SDK API | WebSocket | Event log |
| Amp | Cloud server | Server-stored threads | CLI/web input | N/A | PostgreSQL (cloud) |
| GitHub Copilot | Actions runner | Platform events | PR comments + Mission Control | N/A | GitHub API |
| Devin | Cloud VM | Brain-VM protocol | Web UI + Slack | Browser (VM desktop) | Cloud |

---

## H. Cross-Cutting Insights from All Research

### H1. Consensus Patterns

1. **State detection is the hardest problem.** Every tool struggles. Hybrid confidence-based approach (vde-monitor) is most robust.
2. **Stop must mean stop.** Zeroshot's daemon kept running after stop. Trust-destroying.
3. **Human review is the bottleneck.** Not agent speed. Dashboard value = review speed.
4. **2-4 concurrent agents is the practical ceiling** for a single developer.
5. **Filesystem is Claude Code's universal integration surface.** Tasks, teams, sessions on disk.
6. **Persistent vs ephemeral events must be separated at protocol level.** Happy Coder learned this the hard way.
7. **Agent hallucination of side effects requires mechanical verification.** Zeroshot's git-pusher hallucinated PR creation.
8. **Blind/independent validation is the strongest quality pattern.** Zeroshot + CC Agent Teams.

### H2. Failure Modes to Avoid

| Failure | Root Cause | Tools Affected |
|---------|-----------|---------------|
| Wrong status shown | Heuristic-only detection | Happy Coder, cmux |
| Notification lost when focused | Suppress = don't store | cmux (#963) |
| Session lost after crash | No persistence model | superset, gob, claude-squad |
| Resume fails | Missing resumable invariants | Zeroshot (#438) |
| Shell/env conflicts | Wrapper overrides user config | superset (#1812, #2122) |
| PTY patterns break on CLI update | String matching on output | claude-squad, agent-deck |
| Agent drift/loops | No scope checks | Devin, Composio, OpenHands |
| Cost explosion | No per-session tracking | Amp, OpenHands, Copilot |
| Permission UI breakdown | Generic JSON display | Happy Coder |
| Cold boot latency | Ephemeral runner startup | GitHub Copilot |

### H3. Industry Architecture Convergence

The ecosystem is settling on a 5-layer stack:

```
Layer 1: Structured Protocol  (control plane)
Layer 2: PTY                  (terminal output)
Layer 3: Container/Sandbox    (isolation)
Layer 4: WebSocket            (browser delivery)
Layer 5: SQLite/File          (persistence)
```

### H4. Per-Agent Integration Quality Matrix

| Capability | Claude Code | OpenCode | Codex |
|-----------|------------|----------|-------|
| Headless mode | stream-json bidirectional | Single-shot JSON only | JSONL stream + app-server |
| Hook system | 17 events, HTTP/command | None | notify (turn complete only) |
| MCP support | Full + permission-prompt-tool | Yes (no permission control) | Yes (no permission control) |
| Session resume | --resume, --continue | No | Thread resume |
| Mid-session control | stream-json stdin or PTY | PTY only (fragile) | app-server JSON-RPC or PTY |
| Structured events | Rich (stream-json) | None | Rich (app-server events) |
| Sandbox | None built-in | None | Bubblewrap + Landlock + seccomp |

---

## Source Coverage

Inputs: All 32 files in `.z/research/`, web search for ACP/Bun.Terminal/Codex app-server/MCP spec, and background agent research on PTY libraries, MCP orchestration, and additional control methods.
