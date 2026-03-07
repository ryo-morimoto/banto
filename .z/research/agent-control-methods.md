# Agent Control & Integration Methods Research

**Date:** 2026-03-07
**Purpose:** Comprehensive survey of ALL possible ways an orchestration dashboard could spawn, monitor, and control CLI-based coding agents. Covers 10 methods beyond the already-identified approaches (non-interactive mode, pseudo-PTY, tmux).

---

## 1. Wrapper Process Pattern

**Concept:** A thin wrapper binary sits between the orchestrator and any CLI agent. It spawns the agent as a child process, intercepts stdin/stdout, and exposes a structured API (Unix socket, HTTP, or JSON-RPC) to the orchestrator. The wrapper normalizes the interface so the orchestrator doesn't need per-agent integration code.

### Examples in the Wild

**AWS CLI Agent Orchestrator (CAO):** The most prominent real-world example. CAO is an open-source multi-agent orchestration framework from AWS Labs. It wraps CLI tools (Amazon Q CLI, Claude Code, Codex) in tmux sessions and exposes coordination through MCP servers. Each agent terminal gets a unique `CAO_TERMINAL_ID` environment variable. When an agent calls an MCP tool, CAO's local HTTP server identifies the caller by terminal ID and orchestrates accordingly. Three orchestration patterns: Handoff (synchronous), Assign (async parallel), Send Message (direct communication).

**Codex `app-server`:** OpenAI's Codex CLI has a `codex app-server` subcommand that is essentially a wrapper — it spawns the agent core, translates JSON-RPC 2.0 messages into internal operations, and streams events back. The wrapper sits between any client surface (VS Code, desktop app, web) and the agent. VS Code bundles the binary, launches it as a child process, and keeps a bidirectional stdio channel open.

**codex-acp:** An ACP-compatible wrapper that bridges the Codex runtime with ACP clients over stdio.

**Pattern:**
```
[Orchestrator] <-- Unix socket / HTTP / JSON-RPC --> [Wrapper Process] <-- PTY stdin/stdout --> [CLI Agent]
```

### How It Would Work for banto

1. Build a thin Bun-based wrapper that:
   - Accepts a config (agent binary, args, working directory)
   - Spawns the agent with Bun.Terminal (PTY)
   - Exposes a Unix domain socket with JSON protocol
   - Translates PTY output into structured events (state changes, tool use, etc.)
   - Accepts commands (send input, resize, stop, pause)
2. The banto server communicates with the wrapper over UDS
3. The wrapper handles all per-agent quirks (output parsing, state detection)

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | High | Natural fit — banto already needs output parsing and input injection |
| Reliability | High | Process separation means wrapper crash doesn't kill agent |
| Complexity | Medium | Need to define a protocol and handle reconnection |
| Agent compatibility | All | Works with any CLI agent (CC, OpenCode, Codex, etc.) |

**Verdict:** This is essentially what banto's `runner.ts` already does informally. Formalizing it as a protocol-based wrapper would make it agent-agnostic and testable in isolation. However, for a single-user local setup, the indirection may not be worth it — direct PTY management from the server process is simpler.

---

## 2. Filesystem-Based IPC

**Concept:** Bidirectional communication through files on disk. Agent writes status/results to output files; orchestrator writes commands/tasks to input files. File watches (inotify on Linux, FSEvents on macOS) provide event-driven notification without polling.

### Multi-Agent Shogun's Implementation

Multi-agent-shogun is the canonical example. Its YAML-based IPC has two layers:

**Layer 1 — Persistence (YAML files):**
```
queue/
  shogun_to_karo.yaml          # Command delegation
  tasks/ashigaru{N}.yaml       # Task assignments (1 per worker)
  reports/ashigaru{N}_report.yaml  # Completion reports
  inbox/{agent}.yaml           # Message queues
```

**Layer 2 — Wake-up (kernel events):**
- `inbox_watcher.sh` monitors inboxes via `inotifywait` (Linux kernel inotify)
- Atomic writes using `flock` to prevent corruption
- Wake-up delivered via `/dev/pts/N` direct write (PTY)

**Key design principles:**
- Single-writer principle: each file has exactly one writer, preventing race conditions
- Zero coordination overhead: no API calls for task delegation, status checks, or report aggregation
- Human-readable state: plain YAML files that can be inspected and debugged manually
- Recovery: agents can recover from `/clear` by re-reading YAML files from disk

### inotify Mechanics

inotify is a Linux kernel subsystem for monitoring filesystem events. Key characteristics:
- Event-driven: zero CPU while idle (no polling)
- Fine-grained: watches specific files/directories for specific event types (modify, create, delete, move)
- Limitations: does not support recursive directory watching; each subdirectory needs its own watch
- Not available on networked filesystems (NFS) — changes from one client aren't broadcast to others
- Tools: `inotifywait` (CLI), Watchman (cross-platform), Bun's `Bun.watch()` / Node's `fs.watch()`

### Other Examples

- **Claude Code Tasks:** Stores tasks in `~/.claude/tasks/<TASK_LIST_ID>/tasks.json`. Multiple Claude Code instances can point to the same task list ID for cross-session coordination. This is filesystem-based IPC for task state sharing.
- **Marc Nuri's Dashboard:** Uses the hook/enricher pattern — Claude Code hooks write event data to files, the dashboard reads them.

### How It Would Work for banto

1. Define a `.banto/` directory per project with structured files:
   - `session.status` — current session state (JSON)
   - `session.events` — append-only event log (JSONL)
   - `commands/` — directory where orchestrator drops command files
2. Agent wrapper watches `commands/` via inotify
3. Orchestrator watches `session.status` and `session.events` via inotify
4. Recovery: on restart, read all files to reconstruct state

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | High | Simple, well-understood pattern |
| Reliability | Medium | File corruption possible on crash; need atomic writes |
| Complexity | Low | No protocol design needed; just file read/write |
| Agent compatibility | All | Any agent can read/write files |

**Verdict:** Good for sideband communication (sharing task state, configuration) but insufficient as the primary control channel for terminal-based agents. The latency of file I/O (even with inotify) is higher than direct PTY or socket communication. Best used as a complement: filesystem for persistent state, PTY/socket for real-time I/O.

---

## 3. D-Bus / systemd Integration

**Concept:** Run each agent session as a systemd user service. Use D-Bus for structured IPC. Capture all output through journald.

### Architecture

```
[banto server]
    |
    +-- systemd-run --user --unit=session-{id} -- claude -p "prompt"
    |
    +-- busctl / sd-bus API for control
    |       Start / Stop / Restart unit
    |       Query unit state (active, failed, inactive)
    |       Subscribe to property changes
    |
    +-- journalctl --user -u session-{id} -f -o json
            Real-time structured log streaming
```

### systemd User Services

- Each agent session runs as a transient user service via `systemd-run --user`
- Automatic resource management: CPU limits, memory limits, timeout
- Process lifecycle handled by systemd: restart policies, exit code tracking
- Service status queryable via D-Bus: `ActiveState`, `SubState`, `ExecMainStatus`
- Dependencies: can define ordering between services

### journald Integration

- All stdout/stderr automatically captured to the journal
- Structured metadata: `_SYSTEMD_UNIT`, `_PID`, `_COMM`, timestamps
- Machine-friendly output: `-o json` for scripts, `-o json-pretty` for debugging
- Filtering: `journalctl --user -u session-{id} --since "5 minutes ago"`
- Real-time following: `journalctl --user -u session-{id} -f`
- No log rotation management needed — journald handles it
- Programmatic access via `sd-journal` API (C library, bindable from many languages)

### D-Bus Control Surface

| Operation | D-Bus Method | Notes |
|---|---|---|
| Start session | `StartTransientUnit` | Create and start a new unit |
| Stop session | `StopUnit` | Send SIGTERM, then SIGKILL |
| Restart session | `RestartUnit` | Stop + Start |
| Query state | `GetUnitProperties` | ActiveState, SubState, ExecMainStatus |
| Subscribe to changes | `Subscribe` | PropertyChanged signals |
| Send input | N/A | D-Bus doesn't provide stdin injection |

### How It Would Work for banto

1. `systemd-run --user --unit=banto-session-{id} --property=StandardOutput=journal -- claude -p "prompt" --output-format stream-json`
2. Monitor via `journalctl --user -u banto-session-{id} -f -o json` pipe
3. Stop via `systemctl --user stop banto-session-{id}`
4. Query status via `systemctl --user is-active banto-session-{id}`

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | Medium | NixOS has excellent systemd integration |
| Reliability | Very High | systemd is battle-tested for service lifecycle |
| Complexity | Medium-High | D-Bus API is verbose; journal parsing adds overhead |
| Agent compatibility | Headless only | Only works with non-interactive agents (no PTY) |

**Verdict:** Excellent for headless/non-interactive agent execution (`claude -p`, `codex exec`). journald solves log management for free. However, it fundamentally cannot provide a PTY — systemd services don't have terminals. This makes it unsuitable for interactive agents or terminal streaming. Could work as the execution backend for fire-and-forget tasks, with PTY reserved for interactive sessions.

**Hybrid approach:** Use systemd for session lifecycle management (start, stop, restart, resource limits) and journald for log capture, but use a PTY within the service for terminal output. The service's `ExecStart` would be the wrapper process that manages the PTY internally.

---

## 4. WebSocket Bridge

**Concept:** A local WebSocket server that acts as a proxy between the browser dashboard and multiple agent processes. Each agent process has a dedicated WebSocket endpoint for bidirectional communication.

### How xterm.js Typically Connects

The standard xterm.js architecture has three layers:

1. **Frontend (xterm.js in browser):** Terminal emulator UI. Captures keystrokes, renders ANSI output.
2. **WebSocket layer:** Bidirectional binary channel between browser and server.
3. **Backend (server + PTY):** Spawns a PTY process (via node-pty or equivalent), relays data between WebSocket and PTY.

Data flow:
- Input: Browser keystroke -> WebSocket -> server -> `pty.write(data)` -> agent stdin
- Output: Agent stdout -> PTY data callback -> server -> WebSocket -> xterm.js render

Key patterns from real implementations:
- **One PTY per WebSocket connection:** Each connection gets its own shell/agent instance
- **Heartbeat ping-pong:** RFC 6455 section 5.5 — WebSocket doesn't always indicate status changes; heartbeats detect dead connections
- **@xterm/addon-attach:** Official xterm.js addon for WebSocket attachment
- **Replay buffer:** On reconnect, server sends buffered output so the terminal shows recent history

### Notable Implementations

- **VS Code terminal:** xterm.js + node-pty + WebSocket (or more precisely, IPC in VS Code's case)
- **JupyterLab:** xterm.js for terminal, WebSocket to Jupyter kernel
- **HashiCorp Nomad:** xterm.js + WebSocket for remote task terminal access
- **Theia IDE:** Cloud IDE using xterm.js + WebSocket for terminal

### How banto Already Uses This

banto's v2 architecture already defines this pattern:
```
Terminal Widget (restty/xterm.js) <-- WebSocket --> Elysia WS handler <-- Bun.Terminal --> Claude CLI
```

The WebSocket endpoint is `/api/sessions/:id/terminal`. Binary data flows bidirectionally. A ring buffer on the server provides replay on reconnect.

### Multi-Agent Extension

To support multiple simultaneous agents:
```
Browser Tab 1: WS /api/sessions/abc/terminal  -->  PTY for session abc
Browser Tab 2: WS /api/sessions/def/terminal  -->  PTY for session def
Dashboard:     SSE /api/events                -->  Aggregated status events
```

Each session has its own WebSocket endpoint. The dashboard uses SSE for structured status updates (no need for full terminal output).

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | Very High | Already the planned approach |
| Reliability | High | Well-understood pattern; heartbeat + reconnect needed |
| Complexity | Low-Medium | Standard pattern with good library support |
| Agent compatibility | All | Any CLI agent can be behind a PTY |

**Verdict:** This is already banto's primary integration method and the right choice for browser-based terminal streaming. The key refinement is ensuring proper reconnection with replay buffer and visibility-aware connection management (connect on scroll into view, disconnect on scroll away).

---

## 5. Container-Based Isolation

**Concept:** Run each agent session in an isolated container or microVM. The orchestrator manages container lifecycle and communicates with the agent through container I/O mechanisms.

### Three Isolation Levels

| Level | Technology | Boot Time | Overhead | Isolation |
|---|---|---|---|---|
| Container | Docker, nixos-container, systemd-nspawn | < 1s | Low | Shared kernel |
| Hardened Container | gVisor (user-space kernel) | < 1s | Medium | Syscall interception |
| MicroVM | Firecracker, QEMU, cloud-hypervisor | ~125ms | < 5 MiB | Dedicated kernel |

### NixOS-Specific Options

**nixos-container (systemd-nspawn):**
- NixOS's built-in container mechanism
- Shares host's Nix store (massive advantage: no package duplication)
- Declarative configuration via NixOS modules
- Managed as systemd services
- Limitations: shared kernel, less isolation than VMs

**microvm.nix:**
- Nix flake for building NixOS and running it on Type-2 hypervisors
- Supports 8 hypervisors including Firecracker, QEMU, cloud-hypervisor
- Intended as a more isolated alternative to nixos-container
- Declaratively defined in Nix flake; managed as systemd services
- Michael Stapelberg's blog post demonstrates using microvm.nix for coding agents with Claude Code
- "Break it, throw it away, instantly regrow it" — NixOS declarative model makes this operational reality

### How Orchestrators Attach to Container I/O

**Praktor (Docker):**
- Container communicates with gateway via embedded NATS pub/sub
- Topics: `agent.{id}.input`, `agent.{id}.output`, `agent.{id}.control`
- Agent runs Claude Agent SDK's `query()` inside the container — not a PTY
- Gateway bridges NATS events to WebSocket for browser delivery
- Lazy startup: containers created on first message, not at boot
- Idle reaping: reaper goroutine checks every minute, stops containers idle > N minutes

**OpenHands (Docker):**
- V0: Used `docker exec_run` — stateless, poor stdin handling
- V1: RESTful API server (`action_execution_server`) runs inside the container
- Host sends Action objects via HTTP POST; container executes and returns Observations
- No PTY — all execution is through structured API calls
- Workspace abstraction: `LocalWorkspace` vs `DockerWorkspace` vs `KubernetesWorkspace`
- Production exposes sandbox through three mechanisms for real-time monitoring

**Netclode (Kubernetes + Kata Containers):**
- k3s cluster with Kata Containers runtime (each pod = lightweight VM backed by KVM)
- `agent-sandbox` Custom Resources: Sandbox, SandboxClaim, SandboxTemplate, SandboxWarmPool
- Warm pool reduces session startup latency
- Supports Claude Code, Codex, OpenCode, Copilot
- Tailscale for remote access

### Firecracker MicroVM Specifics

- 125ms boot time, < 5 MiB memory overhead
- Up to 150 microVMs per second per host
- Jailer companion provides second line of defense
- No stdin/stdout attach in the traditional Docker sense — communication is via:
  - Serial console (virtio-serial)
  - vsock (virtual socket: host-guest communication, similar to Unix domain sockets)
  - Network (tap device)

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | High | NixOS mini PC is the target; nixos-container is native |
| Reliability | Very High | Container crashes don't affect host or other sessions |
| Complexity | Medium (nixos-container), High (microvm.nix) | Declarative config helps |
| Agent compatibility | All | Any agent can run inside a container |

**Verdict:** nixos-container is the natural choice for banto's NixOS setup — it shares the host's Nix store (huge advantage), is declaratively configured, and managed as systemd services. microvm.nix is available as an upgrade path if stronger isolation is needed (e.g., running untrusted agent code). Communication between host and container should be via Unix domain socket (bind-mounted into container) or vsock (for microVMs).

---

## 6. LSP-Like Protocol (JSON-RPC over stdio)

**Concept:** Agents expose a Language Server Protocol-inspired interface. JSON-RPC 2.0 messages flow bidirectionally over stdio. The orchestrator spawns the agent as a child process and communicates through structured messages rather than raw terminal I/O.

### Codex App Server (The Reference Implementation)

OpenAI's `codex app-server` is the most mature example:

**Transport:** JSONL over stdio (default) or WebSocket (experimental)

**Protocol:**
1. Client sends `initialize` request with metadata
2. Server responds; client sends `initialized` notification
3. Then: `thread/start` -> `turn/start` -> stream events -> `turn/completed`

**Primitives:**
- **Item:** Atomic unit (message, tool execution, approval request, diff) with lifecycle: started -> delta* -> completed
- **Turn:** Sequence of items from one unit of agent work
- **Thread:** Durable container for an ongoing session; supports creation, resumption, forking

**Control operations:** send turns, approve/reject commands and patches, compact, undo, shutdown

**Why OpenAI rejected MCP for this:** MCP's tool-oriented model didn't map cleanly to IDE interaction semantics (streaming diffs, approval flows, thread persistence).

### Agent Client Protocol (ACP)

ACP is the emerging open standard, created by Zed editor, inspired by LSP:
- JSON-RPC 2.0 over stdio for local agents
- HTTP/WebSocket for remote agents (work in progress)
- Supported by: Zed, Neovim (CodeCompanion, avante.nvim), JetBrains (coming soon)
- Agents: Claude (via Zed adapter), Gemini CLI, Goose, OpenCode
- Open-source under Apache license

**Key difference from MCP:** ACP is client-to-agent (editor controls agent), MCP is agent-to-server (agent accesses tools). They're complementary, not competing.

### Claude Code's Stream-JSON Mode

Claude Code has a lighter version of this pattern:
```bash
claude -p --output-format stream-json --input-format stream-json "prompt"
```
Bidirectional streaming via stdin/stdout in `-p` mode. Each line is a JSON object with a `type` field. This is the closest Claude Code has to an IPC channel.

### How It Would Work for banto

**Option A: Adopt ACP**
- Spawn agents that support ACP (Gemini CLI, Goose, OpenCode via adapter)
- banto acts as an ACP client
- Pro: standard protocol, multi-agent support
- Con: Claude Code doesn't natively support ACP; need adapter

**Option B: Adopt Codex app-server protocol**
- Spawn `codex app-server` for Codex integration
- Pro: richest protocol with thread management
- Con: Codex-specific; other agents don't implement it

**Option C: Custom JSON-RPC wrapper**
- Build a thin wrapper that speaks JSON-RPC over stdio
- Wrapper manages PTY internally
- Pro: agent-agnostic; can wrap any CLI
- Con: need to build and maintain the wrapper

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | Medium-High | Standard protocols exist; agent support varies |
| Reliability | High | Structured protocol prevents parsing errors |
| Complexity | Medium | Protocol implementation + per-agent adapters |
| Agent compatibility | Varies | Codex: app-server. CC: stream-json. OpenCode: ACP. Others: need wrapper |

**Verdict:** The LSP-like protocol approach is the direction the ecosystem is converging on. ACP is the most promising standard. For banto, the practical approach is:
1. Use Claude Code's stream-json mode as the primary integration for CC
2. Use Codex app-server for Codex integration
3. Monitor ACP adoption — when CC supports it, adopt ACP as the unified protocol
4. For agents without structured protocols, fall back to PTY + output parsing

---

## 7. Shared Memory / Ring Buffer

**Concept:** Use shared memory (mmap, shm) for high-throughput data transfer between the agent process and the orchestrator. Ring buffers avoid allocation overhead for streaming terminal output.

### How Ghostty Handles Terminal Data

Ghostty uses a **paged doubly-linked list** architecture (NOT a ring buffer):

- **Offset-based addressing:** All data structures within a Page use offsets relative to page start, not absolute pointers. This enables efficient cloning for render snapshots.
- **Page = contiguous memory-mapped allocation:** Aligned to page boundaries, composed of an even multiple of system pages.
- **Lazy scrollback allocation:** Memory allocated on demand up to `explicit_max_size`. Not pre-allocated.
- **Why not ring buffer:** Linked list architecture makes it easier to support features like scrollback persistence across relaunches and compressed history. Avoids read/write data races between IO thread and renderer.
- **Cell storage:** Every cell preallocates >12 bytes regardless of content. Width of terminal determines memory, not printed content.
- **Grapheme storage:** Multi-codepoint graphemes stored in bitmap allocator within the page.

### Application to banto

banto's v2 architecture already defines a "Ring buffer (1MB, replay)" in the PTY Manager. This is for a different purpose than ghostty's screen buffer:

**banto's ring buffer purpose:**
- Buffer recent PTY output (last 1MB)
- On WebSocket reconnect, replay buffered output so the terminal shows recent history
- Bounded memory: old data is overwritten, preventing unbounded growth

**Implementation options:**
1. **In-process ring buffer:** Simple `Uint8Array` with head/tail pointers in the Bun server. Fastest, simplest. Suitable for banto's single-process architecture.
2. **Shared memory (shm_open + mmap):** Would allow a separate renderer process to read terminal data without copying. Overkill for banto's architecture.
3. **io_uring + shared ring buffer:** Linux-specific high-performance I/O. Extreme overkill.

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | High (in-process), Low (shared memory) | In-process is trivial |
| Reliability | High | Ring buffers are simple and well-understood |
| Complexity | Low (in-process), High (shared memory) | Shared memory needs careful synchronization |
| Agent compatibility | N/A | This is a transport/buffering concern, not agent-specific |

**Verdict:** An in-process ring buffer in the Bun server is the right approach for banto's replay buffer. Shared memory is unnecessary for a single-process server architecture. Ghostty's paged linked list is interesting but solves a different problem (long-term scrollback with persistence, not replay buffering).

---

## 8. Agent-as-Library

**Concept:** Instead of spawning an external CLI process, embed the agent as a library within the orchestrator process. Call agent functions directly, receive structured events through callbacks/streams.

### Available Agent SDKs

**Claude Agent SDK (Anthropic):**
- Python and TypeScript SDKs
- Same infrastructure powering Claude Code, exposed as a programmable library
- Key API: `agent.query()` -> yields typed messages (tool use, text, etc.)
- Supports subagents for parallelization and context isolation
- Context compaction (beta)
- No built-in sandboxing — all execution in local environment

```typescript
import { Agent } from '@anthropic-ai/agent-sdk';
const agent = new Agent({ model: 'claude-opus-4-6' });
for await (const message of agent.query('Fix the auth bug')) {
  // Typed message stream: tool_use, text, error, etc.
}
```

**OpenHands Software Agent SDK:**
- Python SDK for building agents with full working environments
- Key differentiator: native sandboxed execution (Docker, Kubernetes)
- Event-sourced state: all interactions are append-only events
- Workspace abstraction: `LocalWorkspace` vs `DockerWorkspace`
- Model-agnostic via LiteLLM (100+ models)
- MIT licensed

```python
agent = Agent(llm=llm, tools=[TerminalTool(), FileEditorTool()])
conversation = Conversation(agent=agent, workspace=LocalWorkspace(cwd))
conversation.send_message("Fix the failing tests")
conversation.run()
```

**Codex Core (Rust crate):**
- `codex-core` crate exposes `Codex` struct with:
  - `submit(Op::UserInput {...})` — send messages
  - `subscribe_status()` — watch `AgentStatus` (PendingInit, Running, Completed, etc.)
  - `next_event()` — receive typed events (TurnStarted, ExecCommandBegin, etc.)
- Not published to crates.io; internal to the Codex monorepo

**Praktor's Approach:**
- Uses Claude Agent SDK's `query()` inside Docker containers
- Agent-runner is a thin Node.js wrapper around the SDK
- Structured events via NATS, not PTY

### How It Would Work for banto

```typescript
// Hypothetical: banto using Claude Agent SDK directly
import { Agent } from '@anthropic-ai/agent-sdk';

const session = await createSession(task);
const agent = new Agent({
  model: 'claude-opus-4-6',
  tools: [/* file edit, bash, etc. */],
  systemPrompt: assemblePrompt(task, project),
});

for await (const event of agent.query(task.prompt)) {
  await saveSessionEvent(session.id, event);
  broadcastSSE(event);
  // No PTY parsing needed — events are already structured
}
```

### Trade-offs vs CLI Process

| Aspect | Agent-as-Library | CLI Process (PTY) |
|---|---|---|
| Event structure | Typed, structured from the start | Raw terminal output; needs parsing |
| Terminal view | No native terminal UI; would need synthetic rendering | Natural terminal output |
| Resource sharing | Runs in orchestrator's process | Separate process; independent crashes |
| Agent updates | Requires SDK version bump + redeploy | Just update the CLI binary |
| CC subscription | Uses API tokens (metered) | Uses CLI subscription (flat-rate) |
| Interactive mode | No terminal interaction | Full terminal with human input |

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | High | Claude Agent SDK is production-ready |
| Reliability | Medium | Agent crash takes down orchestrator process |
| Complexity | Low-Medium | Cleaner than PTY parsing; but lose terminal |
| Agent compatibility | SDK-specific | Only agents with library SDKs |

**Verdict:** Agent-as-library gives the cleanest integration (no PTY parsing, typed events) but fundamentally conflicts with banto's "CC only" principle and flat-rate CLI subscription model. The Claude Agent SDK uses API tokens (metered billing), not the CC CLI subscription. It also eliminates the terminal view, which is a core banto feature. Best reserved for specific use cases (background tasks, automated reviews) where terminal interaction isn't needed. The PTY approach remains primary for banto's "jot, throw, watch" flow.

---

## 9. GNU Screen (as Alternative to tmux)

**Concept:** Use GNU Screen as the terminal multiplexer for persistent, detachable agent sessions.

### Screen vs tmux for Programmatic Control

| Feature | GNU Screen | tmux |
|---|---|---|
| Input injection | `screen -S name -X stuff 'command\n'` | `tmux send-keys -t name 'command' Enter` |
| Output capture | `screen -S name -X hardcopy /tmp/out` | `tmux capture-pane -t name -p` |
| Session management | `screen -S name -d -m command` | `tmux new-session -d -s name command` |
| Reattach | `screen -r name` (more forgiving) | `tmux attach-session -t name` |
| Control mode | None | `tmux -C` (full protocol) |
| Pane support | Split regions (limited) | Full pane management |
| Scripting | screenrc + `-X` commands | tmux commands + control mode protocol |
| API richness | ~40 commands | ~200+ commands |
| Async notifications | None | `%output`, `%window-add`, etc. |
| Ecosystem | Declining; RHEL 8+ dropped it | Active development; plugins |

### Screen-Specific Capabilities

- **Serial terminal support:** `screen /dev/ttyUSB0` — useful for embedded device interaction
- **Multiuser mode:** Multiple users can share a session with access control (legacy feature)
- **Simpler architecture:** One process per session (vs tmux's client-server model)
- **XDG support:** `SCREENRC=` environment variable for dynamic config loading

### screenrc for Automation

```screenrc
# Start with multiple windows
screen -t agent1 0 claude -p "task1"
screen -t agent2 1 claude -p "task2"

# Log all output
logfile /tmp/screen-%S-%n.log
log on

# Disable visual bell
vbell off

# Large scrollback
defscrollback 10000
```

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | Medium | Works, but fewer features than tmux |
| Reliability | High | Stable, battle-tested |
| Complexity | Low | Simpler than tmux, but less capable |
| Agent compatibility | All | Any CLI agent |

**Verdict:** Screen is strictly inferior to tmux for programmatic control. No control mode protocol, no async notifications, limited pane management, declining ecosystem. The only advantage is simpler reattach behavior and serial device support, neither of which matters for banto. tmux is the clear winner if a terminal multiplexer is needed. However, for banto's architecture (direct PTY via Bun.Terminal), neither is needed as the primary mechanism — they're only relevant for crash recovery / session persistence.

---

## 10. Kubernetes / Nomad Job Scheduler

**Concept:** Use a container orchestrator to schedule and manage agent execution as jobs. Each agent session is a job/pod with defined resource limits, automatic restart policies, and centralized logging.

### Kubernetes for Agent Scheduling

**Netclode (concrete example):**
- Self-hosted remote coding agent built on k3s + Kata Containers
- Custom Resources: Sandbox, SandboxClaim, SandboxTemplate, SandboxWarmPool
- Warm pool pre-provisions sandboxes to reduce latency
- JuiceFS for shared filesystem
- Tailscale for remote access
- Supports Claude Code, Codex, OpenCode, Copilot

**Architecture:**
```
[iOS App / Web UI] <-- Tailscale --> [k3s Cluster]
                                       |
                                       +-- agent-sandbox operator
                                       |     +-- SandboxWarmPool (pre-provisioned)
                                       |     +-- Sandbox per session
                                       |
                                       +-- JuiceFS (shared project storage)
                                       +-- Redis (messaging)
```

**2026 Trends:**
- AI-native platforms are forcing a rethink of Kubernetes scheduling for stateful, long-running agent workloads
- Agent orchestration called "the next Kubernetes" — enterprise teams need to deploy, monitor, scale, and secure fleets of AI agents

### Nomad as a Simpler Alternative

- Single binary, both for clients and servers
- No external services needed (vs Kubernetes needing etcd, API server, etc.)
- Native support for Docker, exec, raw_exec, Java, QEMU task drivers
- Nomad job for an agent session:

```hcl
job "agent-session" {
  type = "batch"

  group "agent" {
    task "claude" {
      driver = "exec"
      config {
        command = "claude"
        args    = ["-p", "Fix the auth bug", "--output-format", "stream-json"]
      }
      resources {
        cpu    = 500
        memory = 512
      }
      logs {
        max_files     = 3
        max_file_size = 10
      }
    }
  }
}
```

- HashiCorp Nomad has xterm.js integration for remote task terminal access
- Companies like Intel, GitHub run Nomad alongside Kubernetes

### Assessment for banto

| Criterion | Rating | Notes |
|---|---|---|
| Feasibility | Low-Medium | Massive overkill for single NixOS mini PC |
| Reliability | Very High | Production-grade scheduling and recovery |
| Complexity | Very High | K8s requires specialized knowledge; Nomad simpler but still heavy |
| Agent compatibility | All | Any containerized agent |

**Verdict:** Kubernetes and Nomad solve the problem of distributed, multi-node agent execution at scale. For banto's single NixOS mini PC, they add enormous complexity with minimal benefit. The only relevant pattern is the **warm pool** concept from Netclode — pre-provisioning container/VM environments so session startup is fast. banto can achieve this with nixos-container or microvm.nix without a full orchestrator. If banto ever needs to scale beyond a single machine, Nomad (not Kubernetes) would be the right choice due to its simplicity and NixOS compatibility.

---

## Summary: Recommendation Matrix

| # | Method | Primary Use | banto Fit | Priority |
|---|---|---|---|---|
| 1 | Wrapper Process | Agent-agnostic API normalization | Medium | Low — direct PTY is simpler for single-user |
| 2 | Filesystem IPC | Persistent state sharing, recovery | Medium | Low — SQLite serves this role |
| 3 | D-Bus / systemd | Service lifecycle, logging | Medium-High | Medium — good for headless tasks + resource limits |
| 4 | WebSocket Bridge | Browser terminal streaming | **Already planned** | **High** — core architecture |
| 5 | Container Isolation | Security, crash isolation | **Already planned** | **High** — nixos-container is native |
| 6 | LSP-Like Protocol | Structured bidirectional control | High | **High** — CC stream-json + ACP trend |
| 7 | Shared Memory | High-throughput buffering | Low | Low — in-process ring buffer suffices |
| 8 | Agent-as-Library | Structured events, no PTY parsing | Medium | Medium — conflicts with CC subscription model |
| 9 | GNU Screen | Terminal multiplexer | Low | None — tmux is strictly better |
| 10 | K8s / Nomad | Distributed scheduling | Low | None — overkill for single machine |

## Key Insight: The Convergence Pattern

The ecosystem is converging on a **layered approach**:

1. **Structured protocol** (JSON-RPC / ACP / stream-json) for agent control and events
2. **PTY** for terminal output when interactive/visual access is needed
3. **Container/VM** for isolation when running untrusted code
4. **WebSocket** for browser delivery
5. **File-based state** for persistence and recovery

banto's v2 architecture already has layers 2, 4, and 5. The biggest gap is layer 1 (structured protocol). Claude Code's `--output-format stream-json --input-format stream-json` is the immediate integration point. ACP is the future standard to watch.

---

## Sources

- [AWS CLI Agent Orchestrator](https://aws.amazon.com/blogs/opensource/introducing-cli-agent-orchestrator-transforming-developer-cli-tools-into-a-multi-agent-powerhouse/)
- [Seven Hosting Patterns for AI Agents](https://james-carr.org/posts/2026-03-01-agent-hosting-patterns/)
- [How to sandbox AI agents in 2026 (Northflank)](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [NixOS + microvm.nix for OpenClaw](https://dev.to/ryoooo/i-built-a-reasonably-secure-openclaw-box-with-spare-pc-parts-nixos-and-microvms-2177)
- [Coding Agent VMs on NixOS with microvm.nix (Stapelberg)](https://michael.stapelberg.ch/posts/2026-02-01-coding-agent-microvm-nix/)
- [microvm.nix GitHub](https://github.com/microvm-nix/microvm.nix)
- [OpenAI Codex App Server Architecture (InfoQ)](https://www.infoq.com/news/2026/02/opanai-codex-app-server/)
- [Codex App Server JSON-RPC Protocol](https://www.adwaitx.com/openai-codex-app-server-json-rpc-protocol/)
- [Agent Client Protocol](https://agentclientprotocol.com/)
- [Zed: Bring Your Own Agent](https://zed.dev/blog/bring-your-own-agent-to-zed)
- [ACP GitHub](https://github.com/agentclientprotocol/agent-client-protocol)
- [Agent Client Protocol: The LSP for AI Coding Agents](https://blog.promptlayer.com/agent-client-protocol-the-lsp-for-ai-coding-agents/)
- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk)
- [OpenHands Runtime Architecture](https://docs.openhands.dev/openhands/usage/architecture/runtime)
- [Ghostty Terminal Emulation (DeepWiki)](https://deepwiki.com/ghostty-org/ghostty/3-terminal-emulation)
- [Ghostty Page Memory (DeepWiki)](https://deepwiki.com/ghostty-org/ghostty/3.6-kitty-graphics-protocol)
- [xterm.js GitHub](https://github.com/xtermjs/xterm.js)
- [Building a Browser-based Terminal (Presidio)](https://www.presidio.com/technical-blog/building-a-browser-based-terminal-using-docker-and-xtermjs/)
- [tmux vs GNU Screen (2025)](https://tmuxai.dev/tmux-vs-screen/)
- [Netclode: Self-Hosted Cloud Coding Agent](https://stanislas.blog/2026/02/netclode-self-hosted-cloud-coding-agent/)
- [AI-Native Platforms and Kubernetes Scheduling](https://theartofcto.com/insights/2026-01-02-ai-native-platforms-agents-kubernetes-scheduling-and-the-return-of-stateful-architecture/)
- [Firecracker MicroVM](https://firecracker-microvm.github.io/)
- [systemd User Services (ArchWiki)](https://wiki.archlinux.org/title/Systemd/User)
- [journalctl Guide (TheLinuxCode)](https://thelinuxcode.com/filtering-displaying-and-maintaining-systemd-logs-with-journalctl-practical-2026-guide/)
