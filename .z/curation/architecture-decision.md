# banto Architecture Decision — Constraint-Applied

Date: 2026-03-07
Input: `.z/curation/agent-integration-options.md` (full landscape)
Method: Apply hard constraints → eliminate → rank remaining → compose

---

## 1. Constraints

### Hard Constraints (non-negotiable)

| # | Constraint | Source | Impact |
|---|-----------|--------|--------|
| H1 | Extensibility is top priority | User directive | No single-agent assumptions. Architecture must support N agents. |
| H2 | Support Claude Code, OpenCode, Codex | User directive | Three agents with very different integration surfaces. |
| H3 | Claude Agent SDK blocked by ToS | User directive + ToS | Cannot use `@anthropic-ai/claude-agent-sdk` |
| H4 | Self-hosted NixOS mini PC | DRAFT.md | No cloud dependencies. Local process management. |
| H5 | Single user | DRAFT.md | No auth complexity (Tailscale only). No multi-tenant. |
| H6 | Browser-first (PWA) | DRAFT.md | Terminal must relay to browser. Mobile-friendly. |
| H7 | SQLite (WAL mode) | DRAFT.md | Single writer. Append-only event ledger fits naturally. |
| H8 | Bun runtime | CLAUDE.md | Use Bun.Terminal for PTY. Bun.spawn for processes. |
| H9 | "Watch" is the core value | DRAFT.md | State visibility > execution speed. |

### Soft Constraints (prefer but trade off)

| # | Constraint | Trade-off |
|---|-----------|-----------|
| S1 | Terminal view in browser | Nice for power users but structured view may suffice for some agents |
| S2 | Minimal dependencies | ACP SDK adds a dep but saves per-agent code |
| S3 | Domain co-location | Keep agent providers in their own domain dir |

---

## 2. Elimination

Options eliminated by constraints:

| Option | Eliminated By | Reason |
|--------|--------------|--------|
| A8. Agent-as-Library (Claude Agent SDK) | H3 | ToS blocks external use |
| A8. Agent-as-Library (Codex core crate) | H8 | Rust crate from TypeScript — FFI complexity |
| A5. Container (Docker) | H4 | Extra dependency on NixOS. nixos-container preferred. |
| A5. Container (Kubernetes/Nomad) | H4 | Massive overkill for single mini PC |
| A7. GNU Screen | — | Strictly inferior to tmux in every dimension |
| A6. systemd User Service (standalone) | S1 | No PTY. Must combine with another method. |
| C7. NATS / Message Bus | S2 | Extra infrastructure for single-user. SQLite is sufficient. |
| D3. ghostty-web | — | Already tried in v1. IME/resize/input broken. Replaced by restty. |
| F6. A2A (Google) | — | Cloud agent ecosystem. Irrelevant for local CLI agents. |
| F8. W3C AI Agent Protocol | — | Too early (2026-2027). |
| F9. LangGraph/AutoGen/CrewAI | — | Python-based. No relevance to CLI agent orchestration. |

---

## 3. The Core Tension

There is a fundamental tension between two modes:

| Mode | How it works | Terminal view? | Structured events? | Works with |
|------|-------------|---------------|-------------------|------------|
| **Protocol mode** | Agent speaks JSON-RPC / stream-json / ACP over stdio | No (stdio consumed by protocol) | Yes (rich, typed) | CC (stream-json), Codex (app-server), all ACP agents |
| **PTY mode** | Agent runs in a pseudo-terminal | Yes (full TUI relayed to browser) | Partial (hooks, output parsing) | Any CLI agent |

**No single mode works for all agents AND all use cases.**

- Claude Code's stream-json gives structured events but no terminal view.
- OpenCode in PTY gives terminal view but no structured events (no hooks, no protocol).
- Codex app-server gives rich structured control but no terminal.
- The user's UI design (Pencil mockups) shows a terminal panel — terminal view is expected.

### Resolution: Dual-Mode Provider Architecture

Each agent provider declares its capabilities. banto's UI adapts to what's available.

```
┌─────────────────────────────────────────────────┐
│                  banto server                     │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │           Agent Provider Registry            │ │
│  │                                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │ │
│  │  │ Claude   │ │ Codex    │ │ ACP         │ │ │
│  │  │ Code     │ │          │ │ (universal) │ │ │
│  │  │ Provider │ │ Provider │ │ Provider    │ │ │
│  │  └────┬─────┘ └────┬─────┘ └──────┬──────┘ │ │
│  │       │             │              │         │ │
│  └───────┼─────────────┼──────────────┼─────────┘ │
│          │             │              │            │
│  ┌───────▼─────────────▼──────────────▼─────────┐ │
│  │         Unified Session Event Stream          │ │
│  │         (AgentStatus, SessionEvent)           │ │
│  └──────────────────┬────────────────────────────┘ │
│                     │                               │
│  ┌──────────────────▼────────────────────────────┐ │
│  │              Session Manager                   │ │
│  │  Event Ledger (SQLite) + Ring Buffer (memory)  │ │
│  └──────────────────┬────────────────────────────┘ │
│                     │                               │
│  ┌──────────────────▼────────────────────────────┐ │
│  │           WebSocket / REST API                 │ │
│  │  Structured events + Terminal stream (binary)  │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 4. Agent Provider Design

### Common Interface

```typescript
interface AgentProvider {
  id: string;                          // "claude-code" | "codex" | "opencode" | ...
  name: string;                        // Display name
  capabilities: AgentCapabilities;

  createSession(config: SessionConfig): AgentSession;
}

interface AgentCapabilities {
  terminal: boolean;          // Can relay terminal output to browser?
  structuredEvents: boolean;  // Emits typed events (tool use, messages)?
  permissions: boolean;       // Can handle permission requests programmatically?
  resume: boolean;            // Can resume after crash/restart?
  midSessionControl: boolean; // Can send messages during execution?
}

interface AgentSession {
  // Lifecycle (all providers MUST implement)
  start(prompt: string): Promise<void>;
  stop(): Promise<void>;

  // Events (all providers MUST emit)
  on(event: "status", cb: (s: AgentStatus) => void): void;
  on(event: "session_event", cb: (e: SessionEvent) => void): void;
  on(event: "exit", cb: (code: number) => void): void;

  // Terminal (optional — only PTY-based providers)
  terminalStream?: ReadableStream<Uint8Array>;
  writeTerminal?(data: string): void;
  resizeTerminal?(cols: number, rows: number): void;

  // Structured control (optional — only protocol-based providers)
  sendMessage?(msg: string): Promise<void>;
  respondToPermission?(decision: PermissionDecision): Promise<void>;
}
```

### Provider Implementations

#### Claude Code Provider (PTY + Hooks + MCP)

**Mode:** PTY (for terminal view) + HTTP hooks (for structured state) + MCP permission-prompt-tool (for permission control)

**Spawn:**
```
Bun.spawn(["claude", ...args], { terminal: { cols, rows } })
```

With pre-configured hooks:
```json
{
  "hooks": {
    "Notification": [{ "type": "http", "url": "http://localhost:PORT/api/hooks/claude-code" }],
    "Stop": [{ "type": "http", "url": "http://localhost:PORT/api/hooks/claude-code" }],
    "PreToolUse": [{ "type": "http", "url": "http://localhost:PORT/api/hooks/claude-code" }],
    "PostToolUse": [{ "type": "http", "url": "http://localhost:PORT/api/hooks/claude-code" }]
  }
}
```

With MCP for permission control:
```
claude --mcp-config '{"banto": {"command": "..."}}' --permission-prompt-tool mcp__banto__permission_prompt
```

| Capability | Value | How |
|-----------|-------|-----|
| terminal | true | Bun.Terminal PTY |
| structuredEvents | true | HTTP hooks → banto API |
| permissions | true | `--permission-prompt-tool` via MCP |
| resume | true | `--resume <session-id>` |
| midSessionControl | true | PTY write (user typing into terminal) |

**State detection:**
1. HTTP hooks → High confidence (Notification idle/permission, Stop, PostToolUse)
2. Process monitoring → Lifecycle boundaries (alive/dead/exit code)
3. PTY output patterns → Fallback only if hooks fail

#### Codex Provider (app-server JSON-RPC)

**Mode:** Protocol (app-server gives full structured control)

**Spawn:**
```
Bun.spawn(["codex", "app-server"], { stdin: "pipe", stdout: "pipe" })
```

Then communicate via JSON-RPC 2.0 over stdio.

| Capability | Value | How |
|-----------|-------|-----|
| terminal | false | Protocol mode — no TUI |
| structuredEvents | true | JSON-RPC events (TurnStarted, TurnComplete, ExecCommand, etc.) |
| permissions | true | JSON-RPC approval methods (accept/decline) |
| resume | true | Thread resume via JSON-RPC |
| midSessionControl | true | `turn/start` JSON-RPC method |

**State detection:**
1. AgentStatus events → High confidence (PendingInit, Running, Completed, Errored)
2. Process monitoring → Lifecycle boundary

**UI adaptation:** No terminal panel. Show structured conversation view (messages, tool calls, diffs) instead.

#### ACP Provider (Universal)

**Mode:** Protocol (ACP JSON-RPC 2.0 over stdio)

**Spawn:**
```
Bun.spawn(["<agent-binary>", "--acp"], { stdin: "pipe", stdout: "pipe" })
```

Or agent-specific ACP activation (varies by agent).

| Capability | Value | How |
|-----------|-------|-----|
| terminal | false | Protocol mode — stdio consumed by ACP |
| structuredEvents | true | ACP events |
| permissions | true | ACP permission request/response |
| resume | varies | Agent-dependent |
| midSessionControl | true | ACP message exchange |

**This covers:** OpenCode, Gemini CLI, Goose, Kiro, Copilot, and any future ACP-compatible agent.

**State detection:**
1. ACP events → High confidence
2. Process monitoring → Lifecycle boundary

#### PTY Fallback Provider

For agents that support neither native protocol nor ACP.

**Mode:** PTY (raw terminal with heuristic state detection)

| Capability | Value | How |
|-----------|-------|-----|
| terminal | true | Bun.Terminal PTY |
| structuredEvents | false | Heuristic only |
| permissions | false | Manual (user types in terminal) |
| resume | false | Unknown |
| midSessionControl | true | PTY write |

**State detection:**
1. PTY output pattern matching → Medium confidence (fragile)
2. Process monitoring → Lifecycle boundary

**This is the last resort.** Any agent that has ACP support should use the ACP provider instead.

---

## 5. Architecture Decisions

### D1. Provider Selection Priority

For each agent, use the richest available integration:

```
1. Agent-native protocol (CC stream-json+hooks, Codex app-server) → Best control
2. ACP → Universal structured control
3. PTY fallback → Terminal view but weak state detection
```

| Agent | Primary Provider | Rationale |
|-------|-----------------|-----------|
| Claude Code | Claude Code Provider (PTY + hooks + MCP) | Richest hooks. Terminal view. Permission control via MCP. |
| Codex | Codex Provider (app-server) | Richest protocol. Full thread lifecycle control. |
| OpenCode | ACP Provider | No native protocol. ACP gives structured events. |
| Gemini CLI | ACP Provider | ACP supported. |
| Goose | ACP Provider | ACP supported. |
| Others (future) | ACP Provider or PTY Fallback | Depends on ACP adoption. |

### D2. Terminal vs Structured View

The UI adapts based on provider capabilities:

| Provider.terminal | Session Detail View |
|------------------|-------------------|
| true | Terminal panel (restty/xterm.js) + Status card + Timeline |
| false | Conversation panel (messages + tool calls + diffs) + Status card + Timeline |

Both views share: Status card, Timeline, Permission UI, Git summary. Only the main content area differs.

### D3. State Detection Strategy

Hybrid multi-layer with confidence levels (vde-monitor pattern):

```
Priority 1: Provider events (hooks, JSON-RPC, ACP)  → High confidence
Priority 2: MCP callbacks (if agent calls banto tools) → Medium confidence
Priority 3: Process monitoring (alive/dead/exit code) → Lifecycle boundaries
Priority 4: PTY output parsing (PTY providers only)  → Low confidence, fallback only
```

False negatives acceptable. False positives NOT acceptable (Happy Coder lesson).

### D4. Session Persistence

| Layer | Storage | Purpose |
|-------|---------|---------|
| Event ledger | SQLite `session_events` (append-only) | Audit trail, state reconstruction, replay |
| Materialized state | SQLite `sessions` | Fast queries, dashboard rendering |
| Terminal scrollback | In-memory ring buffer (1MB/session) | WebSocket reconnection replay |
| Scrollback persistence | Disk file (on session end) | Cold restore (superset pattern) |
| Daemon instance ID | SQLite `server_state` | Orphan reconciliation on restart (gob pattern) |

### D5. Permission Handling

| Provider | Method | UX |
|----------|--------|-----|
| Claude Code | `--permission-prompt-tool` (MCP) | Structured approve/deny in dashboard |
| Codex | app-server JSON-RPC approval | Structured approve/deny in dashboard |
| ACP | ACP permission request/response | Structured approve/deny in dashboard |
| PTY fallback | User types in terminal | Manual interaction |

All structured permission UIs share the same component: typed request display (not raw JSON — Happy Coder lesson), Approve/Deny buttons, "Remember for session" option.

### D6. Terminal Relay

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Client renderer | restty (v2 decision) with xterm.js as fallback | WebGPU + libghostty-vt quality. Swap-compatible. |
| Server PTY | Bun.Terminal | Zero dependencies. Built into Bun. |
| Transport | Per-session WebSocket (binary frames) | 1 active terminal at a time. No multiplexing needed. |
| Flow control | Write callback + watermark thresholds | Prevent backpressure on fast output. |
| Reconnection | Replay from ring buffer | Visibility-aware: connect on expand, disconnect on collapse. |

### D7. Real-Time Event Delivery

| Channel | Transport | Content |
|---------|-----------|---------|
| Session events | WebSocket (JSON) | Status changes, tool use, messages, permissions |
| Terminal output | WebSocket (binary) | Raw PTY bytes (only for terminal-capable providers) |
| Notification | WebSocket + Push API | Always persist. Summary bus for debounce (cmux lesson). |

### D8. Crash Recovery

1. Server tracks `instance_id` in SQLite.
2. On restart: query sessions where `status = running` AND `instance_id != current`.
3. For each orphan:
   - If agent supports resume (CC, Codex): attempt `--resume` / thread resume.
   - If not: mark as `failed` with reason "server restart".
4. Notify user of recovered/failed sessions.

---

## 6. Updated Directory Structure

```
src/server/
├── app.ts
├── db.ts
├── agents/                        # Agent provider layer (NEW)
│   ├── types.ts                   # AgentProvider, AgentSession, AgentCapabilities
│   ├── registry.ts                # Provider registry + factory
│   ├── claude-code/
│   │   ├── provider.ts            # PTY + hooks + MCP integration
│   │   ├── hooks.ts               # HTTP hook endpoint handler
│   │   └── mcp-permission.ts      # permission-prompt-tool implementation
│   ├── codex/
│   │   ├── provider.ts            # app-server JSON-RPC wrapper
│   │   └── rpc-client.ts          # JSON-RPC 2.0 client
│   ├── acp/
│   │   ├── provider.ts            # ACP client wrapper
│   │   └── client.ts              # ACP JSON-RPC 2.0 client
│   └── pty/
│       ├── provider.ts            # Raw PTY fallback
│       └── state-detector.ts      # Heuristic output pattern matching
├── sessions/
│   ├── routes.ts
│   ├── service.ts
│   ├── repository.ts
│   ├── runner.ts                  # Orchestrates provider.createSession()
│   ├── events.ts                  # Event ledger operations
│   └── terminal-relay.ts          # WebSocket binary relay
├── projects/
│   ├── routes.ts
│   ├── service.ts
│   └── repository.ts
├── tasks/
│   ├── routes.ts
│   ├── service.ts
│   └── repository.ts
└── notifications/
    ├── service.ts                 # Always-persist + summary bus
    └── push.ts                    # Web Push API
```

---

## 7. Updated Data Model

```sql
-- Projects
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',  -- backlog | active | done
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions (separated from tasks)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  agent_provider TEXT NOT NULL,           -- claude-code | codex | acp:opencode | pty:...
  agent_session_id TEXT,                  -- Agent's own session/thread ID (for resume)
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | waiting_permission | done | failed
  status_confidence TEXT DEFAULT 'high',  -- high | medium | low
  started_at TEXT,
  finished_at TEXT,
  exit_code INTEGER,
  error TEXT,
  instance_id TEXT,                       -- Server instance that owns this session

  -- Git context
  worktree_path TEXT,
  branch TEXT,

  -- Cost tracking
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,

  -- Terminal
  scrollback_path TEXT,                   -- Disk path for cold restore

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Session Events (append-only ledger)
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  seq INTEGER NOT NULL,                   -- Monotonic per session (Happy Coder pattern)
  type TEXT NOT NULL,                     -- status_changed | tool_use | message | permission_request | ...
  source TEXT NOT NULL,                   -- hook | protocol | mcp | process | heuristic
  confidence TEXT NOT NULL DEFAULT 'high',
  payload TEXT NOT NULL,                  -- JSON
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(session_id, seq)
);

-- Notifications (always-persist, cmux lesson)
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id),
  type TEXT NOT NULL,                     -- permission_required | session_done | session_failed | ...
  title TEXT NOT NULL,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server State (crash recovery)
CREATE TABLE server_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- INSERT INTO server_state VALUES ('instance_id', '<uuid>');
```

---

## 8. Principles Updated

| # | Old | New | Reason |
|---|-----|-----|--------|
| 2 | CC Only | Best Interface Per Agent | User directive: extensibility is #1 |
| — | — | ACP as universal fallback | Covers 7+ agents with single implementation |

All other principles unchanged.

---

## 9. Implementation Priority

### Phase 1: Claude Code Provider (PTY + Hooks)
- AgentProvider interface + registry
- Claude Code provider (PTY spawn, HTTP hooks, terminal relay)
- Session lifecycle with event ledger
- Dashboard with terminal view
- Permission UI via hooks

### Phase 2: Codex Provider (app-server)
- Codex provider (JSON-RPC 2.0 client)
- Structured conversation view (non-terminal sessions)
- Agent selection in task creation UI

### Phase 3: ACP Provider (Universal)
- ACP client implementation
- OpenCode support via ACP
- Any ACP-compatible agent auto-supported

### Phase 4: MCP + Advanced
- banto as MCP server (task context tools)
- `--permission-prompt-tool` for CC
- Push notifications
- Crash recovery with resume

---

## 10. Key Trade-Offs Made

| Trade-Off | Decision | Rationale |
|-----------|----------|-----------|
| Terminal view for Codex | No terminal (structured view) | app-server is superior to PTY parsing. Codex can also run in PTY fallback if terminal is needed. |
| ACP vs agent-native | Both: native for CC/Codex, ACP for others | Native gives richer control. ACP gives breadth. Not mutually exclusive. |
| Single protocol vs multi | Multi (per agent best interface) | No single protocol covers all agents. ACP is closest but less granular than native. |
| PTY output parsing | Last resort only | Fragile. Breaks on CLI updates. Only for agents with zero other integration. |
| tmux vs direct PTY | Direct PTY (Bun.Terminal) | Simpler. No extra dependency. Session persistence via event ledger + scrollback, not tmux. |
| Event-sourced vs CRUD | Event ledger (append-only) + materialized view | Crash recovery, audit trail, replay. SQLite is the single source of truth. |
