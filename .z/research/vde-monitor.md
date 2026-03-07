# vde-monitor Research

Source: https://github.com/yuki-yano/vde-monitor
Investigated: 2026-03-06
Version: 0.9.1

## Overview

Browser-based monitoring and control interface for tmux/WezTerm coding sessions. Designed for Codex CLI and Claude Code workflows.

Core capabilities:
- Monitor terminal sessions from web browser (desktop/mobile)
- Send text/key inputs and raw commands to panes
- View live terminal output (text or image modes)
- Track session/repository timeline and activity history
- Inspect Git diffs, commits, and files
- Launch and manage Codex/Claude agent sessions
- Monitor provider usage and costs
- PWA push notifications per-session

## Tech Stack

- Runtime: Node.js 22.12+
- Package Manager: pnpm 10.28.2
- Backend: Hono (REST API)
- Frontend: React 19 + Vite
- Router: TanStack Router (file-based)
- Server State: TanStack Query
- Client State: Jotai (atom-based)
- Styling: Tailwind CSS 3.4
- Components: Radix UI (headless)
- Icons: Lucide React
- Syntax Highlighting: Shiki
- Virtual Scroll: react-virtuoso
- Lint: oxlint
- Format: oxfmt
- Type Check: tsgo
- Test: Vitest + happy-dom + MSW + Testing Library
- Build: tsdown (server) + Vite (web)

## Monorepo Structure

```
vde-monitor/
├── apps/
│   ├── server/          # Hono REST API server
│   │   └── src/
│   │       ├── index.ts              # CLI entry point
│   │       ├── app.ts                # Hono app creation
│   │       ├── session-registry.ts   # In-memory session store
│   │       ├── monitor.ts            # Session monitor orchestration
│   │       ├── config.ts             # Config management
│   │       ├── cache.ts              # TTL-based cache
│   │       ├── errors.ts             # Error types
│   │       ├── activity-resolver.ts  # Activity detection
│   │       ├── activity-suppressor.ts
│   │       ├── http/
│   │       │   ├── api-router.ts     # Main API gateway (CORS, rate limit)
│   │       │   ├── helpers.ts        # Auth, error helpers
│   │       │   ├── image-attachment.ts
│   │       │   └── routes/
│   │       │       ├── session-routes.ts
│   │       │       ├── session-routes/
│   │       │       │   ├── input-routes.ts    # send text/keys/raw
│   │       │       │   ├── launch-route.ts    # agent spawning
│   │       │       │   ├── screen-routes.ts   # screen capture
│   │       │       │   └── notes-routes.ts    # session notes
│   │       │       ├── git-routes.ts          # diff, commits
│   │       │       ├── file-routes.ts         # file navigation
│   │       │       ├── notification-routes.ts # Web Push
│   │       │       └── usage-routes.ts        # cost dashboard
│   │       ├── monitor/
│   │       │   ├── loop.ts                # Periodic tick (1s)
│   │       │   ├── hook-tailer.ts         # JSONL event stream
│   │       │   ├── pane-update-service.ts # Pane state refresh
│   │       │   ├── agent-resolver.ts      # Agent session ID
│   │       │   ├── fingerprint.ts         # External input detect
│   │       │   ├── pane-state.ts          # Per-pane runtime state
│   │       │   └── pane-log-manager.ts    # Pipe log streaming
│   │       ├── multiplexer/
│   │       │   ├── types.ts               # Abstraction interface
│   │       │   ├── runtime.ts             # Factory
│   │       │   ├── runtime-tmux.ts        # tmux implementation
│   │       │   └── runtime-wezterm.ts     # WezTerm implementation
│   │       ├── domain/
│   │       │   ├── git/
│   │       │   │   ├── git-diff.ts
│   │       │   │   ├── git-commits.ts
│   │       │   │   ├── git-parsers.ts
│   │       │   │   ├── git-utils.ts
│   │       │   │   └── git-query-context.ts
│   │       │   ├── usage-cost/
│   │       │   │   ├── cost-provider.ts
│   │       │   │   ├── claude-transcript-token-source.ts
│   │       │   │   ├── codex-session-token-source.ts
│   │       │   │   ├── litellm-pricing-source.ts
│   │       │   │   └── model-resolver.ts
│   │       │   ├── usage-dashboard/
│   │       │   │   └── usage-dashboard-service.ts
│   │       │   └── claude-usage/
│   │       │       └── claude-usage-service.ts
│   │       ├── notifications/
│   │       │   ├── service.ts
│   │       │   ├── dispatcher.ts
│   │       │   ├── subscription-store.ts
│   │       │   ├── summary-bus.ts
│   │       │   └── types.ts
│   │       ├── app/
│   │       │   ├── cli/cli.ts             # CLI parser
│   │       │   ├── serve/serve-command.ts  # Serve subcommand
│   │       │   └── commands/              # config, token commands
│   │       └── infra/
│   │           └── config/config-loader.ts
│   └── web/             # React + Vite frontend
│       └── src/
│           ├── state/
│           │   ├── session-context.tsx          # Global provider
│           │   ├── session-state-atoms.ts       # Jotai atoms
│           │   ├── query-client.ts              # TanStack Query
│           │   ├── use-session-api.ts           # API client wrapper
│           │   ├── use-session-polling.ts       # Periodic refresh
│           │   ├── session-api-contract.ts      # Type-safe Hono client
│           │   ├── session-api-request-executors.ts
│           │   ├── session-api-query-requests.ts
│           │   └── session-api-action-requests.ts
│           ├── pages/
│           │   ├── SessionDetail/              # Single pane deep dive
│           │   └── ChatGrid/                   # Multi-pane monitoring
│           ├── features/
│           │   ├── auth/                       # Token gate
│           │   ├── notifications/              # Web Push
│           │   ├── pwa-tabs/                   # PWA workspace tabs
│           │   └── shared-session-ui/          # Shared components
│           │       ├── AnsiVirtualizedViewport
│           │       ├── PaneGridLayout
│           │       ├── PaneTextComposer
│           │       └── SessionSidebar
│           ├── components/ui/                  # Primitives
│           └── lib/
│               ├── ansi*.ts                    # ANSI rendering
│               ├── api-utils.ts
│               ├── session-format.ts
│               ├── session-group.ts
│               └── use-visibility-polling.ts
├── packages/
│   ├── shared/          # Cross-package types and schemas
│   │   └── src/
│   │       ├── types.ts          # Core domain model (20KB)
│   │       ├── schemas.ts        # Zod validation (31KB)
│   │       ├── api-contract.ts   # Type-safe API contracts
│   │       ├── paths.ts          # XDG path resolution
│   │       └── config-allowlist.ts
│   ├── agents/          # Agent state estimation
│   │   └── src/
│   │       └── state-estimator.ts
│   ├── tmux/            # tmux integration
│   │   └── src/
│   │       ├── inspector.ts      # Pane listing + parsing
│   │       ├── adapter.ts        # execa wrapper
│   │       ├── screen.ts         # Text capture
│   │       └── pipe.ts           # Log streaming
│   ├── wezterm/         # WezTerm integration
│   └── hooks/           # Claude/Codex hook integration
│       └── src/
│           ├── cli.ts            # Hook CLI entry (13KB)
│           ├── claude-notify.ts  # Event processing (16KB)
│           └── claude-summary.ts # Summary generation (8.9KB)
└── scripts/
    └── dev.ts           # Dev server coordination
```

## Architecture Patterns

### 1. Multiplexer Abstraction

Common interface for tmux and WezTerm:

```typescript
MultiplexerRuntime = {
  backend: "tmux" | "wezterm",
  inspector: {
    listPanes(): Promise<PaneMeta[]>,
    readUserOption(paneId, key): Promise<string | null>,
  },
  screenCapture: {
    captureText(options): Promise<TextCaptureResult>,
  },
  actions: {
    sendText(paneId, text, enter): Promise<MultiplexerActionResult>,
    sendKeys(paneId, keys): Promise<MultiplexerActionResult>,
    launchAgentInSession(input): Promise<MultiplexerLaunchResult>,
  },
  pipeManager, captureFingerprint, pipeSupport
}
```

Factory selects implementation based on config:
```typescript
const runtime = createMultiplexerRuntime(config); // tmux OR wezterm
```

**Takeaway**: Abstract the execution environment behind a unified interface. banto's nixos-container can use the same pattern.

### 2. Polling + Hook Events Hybrid Monitoring

Multi-layer approach with confidence levels:

| Layer | Source | Confidence | Mechanism |
|---|---|---|---|
| Hook Events | Claude/Codex hooks | High | JSONL file tail |
| Polling | tmux/wezterm state | Medium | 1s interval queries |
| Fingerprint | Screen capture diff | Low | Change detection |
| Fallback | No data | - | UNKNOWN state |

```
Monitor Loop (1s interval)
  -> updateFromPanes() [pane-update-service.ts]
  -> inspector.listPanes() [tmux/wezterm]
  -> estimateState(signals) [agents/state-estimator.ts]
  -> registry.update(detail)
  -> notifyListeners()
```

**Takeaway**: Don't rely on a single mechanism. Hook events for high-fidelity state, polling as baseline, fingerprints for edge cases.

### 3. JSONL File-Based IPC (Hook Events)

Claude/Codex hooks write to `~/.vde-monitor/events/<server-key>/claude.jsonl`:

```json
{"ts": 1234, "hook_event_name": "...", "session_id": "...", "tmux_pane": "%5", "cwd": "/path", "transcript_path": "...", "payload": {...}}
```

Server tails the file in real-time:
```typescript
const tailer = createJsonlTailer(eventLogPath);
tailer.onLine((line) => {
  handleHookLine(line, registry.values(), handleHookEvent);
});
```

**Takeaway**: File-based IPC is simple, debuggable, and crash-resilient. No API call needed from agent process. banto could use the same for agent -> server communication.

### 4. Session Registry (In-Memory + Observer)

```typescript
createSessionRegistry() = {
  snapshot(): SessionSummary[],
  getDetail(paneId): SessionDetail | null,
  update(detail): void,        // upsert + notify listeners
  removeMissing(activeSet): void,
  onChanged(listener): void,
  onRemoved(listener): void,
  values(): SessionDetail[],
}
```

- Simple Map<paneId, SessionDetail>
- Observer pattern for change notification
- No DB, persists to `~/.vde-monitor/state.json`

**Takeaway**: For banto's session tracking, in-memory Map + observer is sufficient. DB for tasks, in-memory for live session state.

### 5. State Timeline

```typescript
stateTimeline.add({
  paneId,
  at: timestamp,
  state: SessionStateValue,
  reason: string,
  snapshot: {...}
})
```

Records every state transition with reason. UI renders as a timeline view showing "what changed and why".

**Takeaway**: Record state transitions with reasons, not just current state. Essential for "watch" functionality in banto.

### 6. Session State Machine

```typescript
type SessionStateValue =
  | "RUNNING"
  | "WAITING_INPUT"
  | "WAITING_PERMISSION"
  | "SHELL"
  | "UNKNOWN"
```

State estimation logic in `state-estimator.ts`:
- Hook data available -> use hook state directly
- No hook data + recent output -> RUNNING
- No hook data + timeout -> WAITING_INPUT
- Codex question prompt detected -> WAITING_INPUT

**Takeaway**: Explicit state enum with clear estimation rules. banto sessions need similar states.

### 7. Rate Limiting + Idempotency

Rate limits per token:
- Send text: 1 req/1s, 10 req/min
- Screen capture: 1 req/1s, 10 req/min
- Raw input: 1 req/1s, 200 req/min

Idempotency:
- Client sends `requestId` with operations
- Server deduplicates within short window
- Prevents double-sends from UI retries

**Takeaway**: Essential for banto's API layer. Rate limit agent operations, deduplicate submissions.

### 8. Screen Fingerprinting

```typescript
captureFingerprint(paneId, useAlt): Promise<string | null>
```

Captures screen state hash. If fingerprint changes unexpectedly (not from agent output), marks as external input activity.

**Takeaway**: Useful for detecting when users manually interact with agent sessions.

### 9. Config Management

Global config: `~/.config/vde/monitor/config.yml`

- Auto-generated required keys with sensible defaults
- Zod schema validation (31KB of schemas)
- Config allowlist for security
- CLI commands: `config init`, `config check`, `config prune`, `config regenerate`

**Takeaway**: Strong config validation with auto-generation. banto should validate config at startup with clear error messages.

### 10. Notification System

Web Push integration:

```
State transition detected
  -> dispatcher.ts routes to subscriptions
  -> summary-bus.ts aggregates rapid changes into single notification
  -> Web Push API sends to browser
```

Subscription management:
- Subscribe/revoke/remove via API
- Persisted to `~/.vde-monitor/notifications.json`
- Event types: waiting_permission, task_completed, error

**Takeaway**: Summary bus pattern prevents notification spam. Aggregate rapid state changes before pushing.

## Frontend Patterns

### State Management Stack

```
TanStack Query (server state)
  + Jotai atoms (client state)
  + React Context (session connection)
```

Key atoms:
- Session grouping (by repo or window)
- Sidebar width (resizable)
- Pinned sessions
- Last input timestamps

### API Client Architecture

```
session-api-contract.ts     # Type-safe Hono client types
session-api-request-executors.ts  # Raw API calls
session-api-query-requests.ts     # TanStack Query hooks (reads)
session-api-action-requests.ts    # TanStack Query mutations (writes)
session-api-screen-request.ts     # Screen polling with delta
```

Clean separation: contract -> executors -> hooks.

### ANSI Rendering

Custom ANSI-to-HTML pipeline:
- `ansi*.ts`: Color parsing, background padding, diff highlighting
- `AnsiVirtualizedViewport`: Virtual scroll for large outputs
- `react-virtuoso` for performance

### Visibility-Aware Polling

```typescript
useVisibilityPolling()
```

Pauses polling when browser tab is not visible. Resumes on focus.

**Takeaway**: Essential for banto to avoid unnecessary server load.

## Build & CI

### Build Pipeline

**tsdown** bundles 3 entry points:
1. `dist/index.js` - Full server + CLI
2. `dist/vde-monitor-hook.js` - Hook CLI (runs in Claude/Codex process)
3. `dist/vde-monitor-summary.js` - Summary generation

**Vite** builds frontend -> `apps/web/dist/` -> served statically from Hono server.

### CI Pipeline (.github/workflows/ci.yml)

```
Ubuntu Latest + Node 22.12.0
  -> pnpm install (cached)
  -> lint (oxlint)
  -> format check (oxfmt)
  -> typecheck (tsgo)
  -> test (vitest)
```

Uses `concurrently` for parallel checks.

### Dev Scripts (scripts/dev.ts)

- Coordinates server + web dev servers
- Auto-finds available ports
- Handles --public and --tailscale flags
- QR code display for mobile access

## Data Flow Diagrams

### Session List Update

```
Monitor Loop (1s)
  |
  v
updateFromPanes()
  |
  v
inspector.listPanes()  <-- tmux/wezterm
  |
  v
estimateState(signals)  <-- agents/state-estimator.ts
  |
  v
registry.update(detail)
  |
  v
onChanged listeners  --> WebSocket/SSE --> frontend
```

### Hook Event Processing

```
Claude/Codex finishes step
  |
  v
Hook script runs vde-monitor-hook
  |
  v
Append line to claude.jsonl
  |
  v
jsonlTailer streams new line
  |
  v
handleHookEvent() updates paneStates
  |
  v
Next poll tick merges hook state
```

### Web Session Display

```
SessionDetail mounts
  |
  v
useSessionApi() -> GET /api/sessions/:paneId
  |
  v
TanStack Query caches
  |
  v
Polling interval -> GET /api/sessions/:paneId/screen
  |
  v
ANSI -> HTML rendering
  |
  v
Virtual scroll viewport (react-virtuoso)
```

## Persistence Strategy

All runtime data in `~/.vde-monitor/`:

| File | Content |
|---|---|
| `token.json` | Bearer token for API auth |
| `state.json` | Session registry, timeline, repo notes |
| `push-vapid.json` | Web Push VAPID keys |
| `notifications.json` | Push subscriptions |
| `events/<key>/claude.jsonl` | Hook event log (append-only) |

No database. File-based persistence only.

## Relevance to banto

### Patterns to Adopt

| Pattern | vde-monitor | banto Application |
|---|---|---|
| JSONL file IPC | Hook events via claude.jsonl | Agent -> server event communication |
| Session Registry + Observer | In-memory Map + listeners | Live session state tracking |
| State Timeline | Transition history with reasons | Task/session audit log |
| Multiplexer Abstraction | tmux/wezterm unified | Container runtime abstraction |
| Rate Limiting + Idempotency | Per-token rate limits | API boundary protection |
| Polling + Events Hybrid | Multi-layer monitoring | Reliable session state |
| Fingerprinting | External input detection | Agent activity vs user input |
| Notification Summary Bus | Aggregate rapid changes | Prevent notification spam |
| Visibility-Aware Polling | Pause on tab hidden | Reduce server load |
| Config Validation | Zod schemas + auto-gen | Startup config validation |

### Patterns to Skip

| Pattern | Reason |
|---|---|
| Image-mode screen capture | macOS-only, not relevant for NixOS |
| WezTerm support | banto targets nixos-container, not terminal multiplexers |
| PWA tabs/workspaces | banto is single-view dashboard |
| Worktree context switching | banto uses separate containers |

### Key Differences

| Aspect | vde-monitor | banto |
|---|---|---|
| Execution | tmux/WezTerm panes | nixos-container |
| Storage | File-based (JSON, JSONL) | bun:sqlite |
| API | Hono | Elysia + Eden |
| Real-time | Polling + file tail | WebSocket (Elysia built-in) |
| Scope | Monitor existing sessions | Create + manage + monitor tasks |
| Agent | External (Codex/Claude CLI) | Integrated (Agent SDK) |
