# Praktor (mtzanidakis/praktor) Research

Date: 2026-03-07
Sources:
- https://github.com/mtzanidakis/praktor

A lightweight, self-hosted multi-agent Claude Code orchestrator with Telegram I/O, Docker isolation, swarm patterns, and a Mission Control UI. Written in Go (gateway) + TypeScript (agent-runner) + React (UI). Positioned as an alternative to OpenClaw. MIT licensed, 8 stars, created 2026-02-13, actively developed by a single maintainer.

---

## Overview

**Repository:** https://github.com/mtzanidakis/praktor
**Language:** Go (gateway) + TypeScript (agent-runner) + React (UI)
**License:** MIT
**Stars:** 8 | **Created:** 2026-02-13 | **Last pushed:** 2026-03-06
**Self-description:** "Multi-agent Claude Code orchestrator with Telegram I/O, Docker isolation, swarm patterns, and Mission Control UI"
**Positioning:** Lightweight, self-hosted alternative to OpenClaw

---

## Architecture

### High-Level Data Flow

```
Telegram --> Go Gateway --> Router --> Embedded NATS --> Agent Containers (Docker)
                |                                           |
            SQLite DB                              Claude Agent SDK (query())
                |
     Mission Control (React SPA)
```

A single Go binary runs all core services: Telegram bot, message router, NATS message bus, agent orchestrator, scheduler, swarm coordinator, and HTTP/WebSocket server. The UI is embedded in the binary as a static SPA.

### Key Components

| Component | Technology | Notes |
|-----------|-----------|-------|
| Gateway | Go 1.26 | Single binary, all services in-process |
| Message bus | Embedded NATS (nats-server/v2) | JetStream enabled, 16MB max payload |
| Agent runtime | Node.js + Claude Agent SDK | Bundled with esbuild, no node_modules at runtime |
| Container isolation | Docker API (docker/docker SDK) | Named volumes, praktor-net bridge network |
| Persistence | SQLite (modernc.org/sqlite, pure Go) | WAL mode, foreign keys, auto-migrations |
| Web UI | React SPA (Vite) | Dark theme, indigo accent, lazy-loaded routes |
| Secrets | AES-256-GCM + Argon2id | Deterministic salt from passphrase |
| Telegram | telego (long-polling) | Slash commands, file upload/download |
| Scheduling | adhocore/gronx | Cron, interval, relative delay, one-shot |
| Backup | zstd-compressed tarballs | All praktor-* Docker volumes |

### Process Boundaries

The system has exactly two process types:

1. **Gateway (Go)** — Runs as a Docker container with access to Docker socket. Manages everything: Telegram, NATS, HTTP, SQLite, config watching.
2. **Agent containers (Node.js)** — One per agent, spawned on demand. Each runs `node /app/index.mjs` which connects to NATS and calls the Claude Agent SDK.

This is a clean separation: the gateway orchestrates, agents execute. They communicate exclusively through NATS pub/sub. No HTTP between them.

### Embedded NATS — Real-Time Pattern

#### How It Works

NATS is embedded directly in the Go gateway binary using `nats-io/nats-server/v2`. No external NATS deployment needed.

```go
// server.go
opts := &natsserver.Options{
    Port:       port,
    NoLog:      true,
    NoSigs:     true,
    JetStream:  true,
    StoreDir:   cfg.DataDir,
    MaxPayload: 16 << 20, // 16MB for file transfers
}
ns, err := natsserver.NewServer(opts)
go ns.Start()
```

The gateway creates a NATS client for itself, and agent containers connect to NATS via the network (resolved hostname for Docker, localhost for local dev).

#### Topic Structure

```
agent.{agentID}.input           # Host -> Container: user messages
agent.{agentID}.output          # Container -> Host: agent responses (text, result)
agent.{agentID}.control         # Host -> Container: shutdown, ping, abort, clear_session
agent.{agentID}.route           # Host -> Container: routing classification (request-reply)
host.ipc.{agentID}              # Container -> Host: IPC commands (request-reply)
swarm.{swarmID}.chat.{groupID}  # Inter-agent collaborative chat
events.agent.{agentID}          # Agent lifecycle events (broadcast to WebSocket)
events.swarm.{swarmID}          # Swarm lifecycle events
events.>                        # Wildcard for all events
```

#### NATS vs WebSocket Comparison

| Aspect | NATS (Praktor) | WebSocket (banto) |
|--------|---------------|-------------------|
| **Transport** | TCP pub/sub between processes | Browser-server bidirectional |
| **Purpose** | Inter-process communication (gateway <-> containers) | Client push (server -> browser) |
| **Topology** | Star (all agents connect to embedded server) | Hub (server broadcasts to browser clients) |
| **Durability** | JetStream for persistence | No persistence |
| **Request-reply** | Built-in (used for routing queries, IPC) | Would need custom protocol |
| **Complexity** | Adds a dependency but solves container communication cleanly | Simpler for browser-only use case |

Key insight: **NATS is NOT used for browser communication**. The browser connects via standard WebSocket to the Go gateway. NATS is purely for gateway-to-container communication. The gateway bridges NATS events to WebSocket:

```go
// Events flow: NATS topic -> Gateway handler -> WebSocket Hub -> Browser
client.Subscribe("agent.*.output", func(msg *nats.Msg) {
    o.handleAgentOutput(msg)  // -> publishes to events.agent.{id} -> WebSocket hub
})
```

**Takeaway**: プロセス間通信 (NATS) とブラウザ通信 (WebSocket) を分離する設計は正しい。banto は nixos-container と Unix domain socket で IPC、Elysia WebSocket でブラウザ通信、という 2 層構成にすべき。

#### IPC Pattern

Agent containers can call back to the gateway via NATS request-reply on `host.ipc.{agentID}`. This enables:
- Scheduled task CRUD
- User profile read/update
- Swarm chat messaging
- Extension status updates
- File sending (to Telegram)

This is elegant: the agent container doesn't need HTTP access to the gateway. Everything goes through NATS.

**Takeaway**: コンテナからホストへのコールバックは request-reply パターンが最適。banto は Unix domain socket + JSON protocol で同等を実現。

### Docker Isolation

#### Container Lifecycle

1. **Lazy startup**: Containers are created on first message to an agent, not on gateway boot.
2. **Idle reaping**: A reaper goroutine checks every minute and stops containers idle longer than `idle_timeout` (default 10m).
3. **Config-triggered restart**: When an agent's YAML config changes, its container is stopped and lazily restarted on next message.
4. **Max running limit**: `max_running` (default 5) caps concurrent containers.

#### Container Readiness Detection

The gateway detects agent readiness by watching NATS client count:

```go
clientsBefore := o.bus.NumClients()
// ... start container ...
// Poll until NATS client count increases
for {
    if o.bus.NumClients() > clientsBefore {
        time.Sleep(500 * time.Millisecond) // Let subscriptions register
        break
    }
}
```

This is a clever hack: instead of implementing a health check endpoint, it uses the NATS client count as a readiness signal.

**Takeaway**: Lazy startup + idle reaping + max running limit は banto にそのまま適用可能。nixos-container も「タスク投入時に起動 → アイドル N 分で停止 → 同時実行上限」で管理すべき。NATS client count の代わりに、コンテナ内エージェントが Unix domain socket に接続した時点を readiness signal にすれば同等。

#### Volume Strategy

All state uses Docker named volumes (no host path mounts for agent data):

| Volume | Path | Purpose |
|--------|------|---------|
| `praktor-wk-{workspace}` | `/workspace/agent` (rw) | Agent workspace (code, memory.db) |
| `praktor-global` | `/workspace/global` (ro) | Global CLAUDE.md and USER.md |
| `praktor-home-{workspace}` | `/home/praktor` (rw) | Claude settings, nix profile, skills |

**Takeaway**: Named volume で workspace / global / home を分離する設計は堅い。banto の nixos-container でも「プロジェクト作業領域 (rw)」「共有設定 (ro)」「エージェントホーム (rw)」の 3 層マウントを検討すべき。host path mount を避けることでコンテナ間の干渉を防げる。

#### Per-Agent Memory Database

Each agent has its own SQLite database at `/workspace/agent/memory.db` inside its volume. This is separate from the gateway's main SQLite. The agent-runner exposes MCP tools for memory operations:

- `memory_store(key, content, tags)` — Upsert a memory
- `memory_recall(query)` — LIKE search across keys, content, tags
- `memory_delete(key)` — Delete by exact key
- `memory_forget(query)` — Delete all matching
- `memory_list()` — List all keys

On startup, existing memory keys are loaded into the system prompt so the agent knows what it has stored.

**Takeaway**: Per-agent memory を MCP tool として公開し、起動時にキー一覧を system prompt に注入するパターンは秀逸。banto でもセッション固有の学習・メモを SQLite + MCP tool で永続化し、同一タスクの再実行時に前回の学びを引き継がせるべき。

#### Agent Image

The `Dockerfile.agent` is a multi-stage build:
1. Go stage: builds `ptask` CLI and downloads Claude Code binary
2. playwright-cli stage: installs playwright-cli, extracts skill files
3. agent-builder stage: bundles TypeScript agent-runner with esbuild
4. Runtime stage: Alpine 3.23 with bash, git, chromium, nix, Node.js, ripgrep

Notable: the runtime has NO `node_modules` — everything is esbuild-bundled into single .mjs files. This keeps the image lean.

**Takeaway**: Multi-stage build で最終イメージから node_modules を排除する手法は参考になるが、banto は nixos-container なので Nix プロファイルベースの依存管理が自然。Docker multi-stage の代わりに Nix flake で同等のレイヤ分離を実現。

#### Nix in Containers

Agents with `nix_enabled: true` get `nix-daemon` started as root via Docker exec after container creation. The agent-runner detects nix-daemon via `pgrep` and adds instructions to the system prompt. Agents can install packages on demand via MCP tools.

Random-interval nix garbage collection runs once per day across all nix-enabled agents.

**Takeaway**: banto は nixos-container を使うため Nix は標準装備。Praktor の「nix_enabled フラグ + pgrep で daemon 検出 + system prompt 注入」は不要で、NixOS container なら declarative configuration で依存を定義し、nix-collect-garbage を定期実行するだけでよい。banto のアドバンテージ。

### React Mission Control UI

#### Pages

| Page | Purpose |
|------|---------|
| **Dashboard** | Active agents count, total agents, pending tasks, uptime, recent messages |
| **Agents** | List definitions with status (running/stopped), model, message count, start/stop buttons, AGENT.md editor, extensions manager |
| **Conversations** | Message history per agent, real-time updates via WebSocket |
| **Scheduled Tasks** | CRUD for cron/interval/one-shot tasks, last result display |
| **Secrets** | Vault management (create, assign to agents, edit) |
| **Swarms** | Visual SVG graph editor for multi-agent topology, launch/delete/replay |
| **User Profile** | Edit USER.md (shared across all agents) |

#### Real-Time Updates

The UI connects to `/api/ws` via WebSocket. The `useWebSocket` hook provides events. The Dashboard debounces event-triggered refetches to avoid hammering. Conversations show messages in real-time.

#### Agent Extensions UI

A tabbed component (`AgentExtensions.tsx`) manages per-agent:
- **MCP Servers** — JSON config for stdio/HTTP servers with secret references
- **Marketplaces** — Plugin marketplace sources
- **Plugins** — Claude Code marketplace plugins with enable/disable
- **Skills** — Custom SKILL.md instructions with optional file attachments

#### Design

Inline styles with CSS variables for theming (dark/light toggle). No component library. SVG icons hand-written. Responsive with a hamburger menu for mobile.

### Repository Stats

- 100+ files across Go (gateway), TypeScript (agent-runner), React (UI)
- Go dependencies: telego, docker SDK, nats-server, nats.go, modernc/sqlite, gorilla/websocket, uuid, gronx, zstd
- All 19 issues are Dependabot (closed)
- 50+ commits in 3 weeks (created 2026-02-13)
- Active development, single maintainer

### Feature Timeline (from commits)

- 2026-02-13: Initial release
- 2026-02-25: Dependabot setup, dependency updates
- 2026-02-26: Positioned as OpenClaw alternative
- 2026-02-28: Agent SDK bumps
- 2026-03-02: Telego upgrade
- 2026-03-04: Security fixes (secret access control, orphaned agent IDs)
- 2026-03-06: Latest SDK bump (0.2.69)

### SQLite Schema (Gateway)

Tables: `agents`, `messages`, `scheduled_tasks`, `agent_sessions`, `swarm_runs`, `secrets`, `agent_secrets`, `agent_mcp_servers`, `agent_marketplaces`, `agent_plugins`, `agent_skills`

WAL mode, 5s busy timeout, foreign keys enabled.

---

## Well-Regarded Features

Since there are only dependency-update issues (19 total, all closed, all Dependabot), there's no user feedback in Issues. However, from the code and README, the strong points are:

1. **Single binary deployment** — `docker compose up -d` and done. No external NATS, no external DB, no multi-service orchestration.

2. **Hot config reload** — File mtime polling (3s) + SHA-256 verification. Changed agents are lazily restarted. This is operationally excellent.

3. **Vault with secret:name references** — Clean syntax in YAML config (`GITHUB_TOKEN: "secret:github-token"`), resolved at container start, never exposed to LLM. Security instructions baked into every agent's system prompt.

4. **Per-agent memory** — SQLite-backed persistent memory with MCP tools. Memory keys listed in system prompt so agents know what they've stored. This is a pattern banto should pay attention to.

5. **NATS IPC** — Request-reply pattern gives agent containers a clean way to call back to the gateway (create tasks, send files, update profile) without needing HTTP.

6. **Swarm orchestration** — Graph-based with topological sort, union-find for collaborative groups, tier-based parallel execution. The visual SVG graph editor is a standout UI feature.

7. **Nix package manager** — Agents can self-install tools. No need for custom Docker images per agent.

8. **playwright-cli integration** — Browser automation pre-baked, skill auto-loaded, persistent sessions.

---

## Poorly-Regarded Features / Pain Points

1. **Telegram-centric** — Primary I/O is Telegram. The web UI (Mission Control) is monitoring-only — you cannot send messages to agents from it. This is a fundamental design choice that limits the browser experience.

2. **No terminal/streaming in UI** — The Conversations page shows completed messages. There's no live streaming of agent output, no terminal view of what the agent is doing in real-time. You see the final result, not the process.

3. **No task/project management** — Despite the name "Mission Control", there's no task board, no project grouping, no workflow management. Tasks are only scheduled tasks (cron jobs). The dashboard is a status monitor, not a task manager.

4. **Docker dependency** — Hard requirement on Docker. The gateway needs Docker socket access. This is fine for most setups but won't work on systems where Docker isn't available or desired.

5. **Claude-only** — Explicitly CC-only (which is also banto's stance), but worth noting as a limitation.

6. **No multi-user** — Single-user design. Auth is a single shared password.

7. **Memory is LIKE-based** — Memory search is simple SQL LIKE matching. No semantic search, no embeddings. Fine for small memory sets but won't scale well.

8. **All issues are Dependabot** — Zero user-filed issues. This could mean the tool is too new for community feedback, or that the user base is essentially just the author.

9. **No test coverage for UI** — Agent-runner has tests, Go internal packages have tests, but the React UI has none.

10. **Inline styles** — The entire UI uses inline styles with CSS variables. No CSS modules, no Tailwind, no component library. This will be hard to maintain as the UI grows.

---

## User Feedback Summary

No community feedback exists. All 19 GitHub issues are Dependabot dependency updates (all closed). Zero user-filed issues, zero discussions, and no external reviews or blog posts were found. The project has 8 stars and appears to be used primarily by its single maintainer. Any assessment of strengths and weaknesses is derived from code review and README analysis, not from actual user reports.

---

## Learnings for banto

### What Users Actually Want

**banto vs Praktor comparison for context:**

| Dimension | banto | Praktor |
|-----------|-------|---------|
| **Primary I/O** | Browser dashboard | Telegram |
| **Container isolation** | nixos-containers | Docker |
| **Message bus** | Elysia WebSocket | Embedded NATS |
| **Persistence** | bun:sqlite | modernc.org/sqlite (pure Go) |
| **Frontend** | React + TanStack Router/Query | React + react-router + manual fetch |
| **Agent SDK** | Claude Agent SDK | Claude Agent SDK |
| **Scheduling** | (not yet designed) | Cron/interval/one-shot |
| **Terminal view** | Planned (ghostty-web/restty) | None |
| **Task management** | Core feature | Not a feature |

1. **Per-Agent Persistent Memory (High Priority)** — Praktor's `memory.db` per agent is a strong pattern. Each agent gets its own SQLite database with key-value memories, searchable via MCP tools. Memory keys are listed in the system prompt at conversation start. banto should implement this. Since banto uses nixos-containers instead of Docker, the memory DB would live in the container's filesystem (which persists between sessions).

2. **Secret Vault with Declarative References (Medium Priority)** — The `secret:name` syntax in agent config is clean:
   ```yaml
   env:
     GITHUB_TOKEN: "secret:github-token"
   files:
     - secret: gcp-service-account
       target: /etc/gcp/sa.json
   ```
   Secrets are encrypted at rest, resolved at container start, and never passed through the LLM. Security instructions are baked into every agent's system prompt. banto should adopt this pattern for managing API keys and tokens across sessions.

3. **System Prompt Assembly Pattern (High Priority)** — Praktor's `loadSystemPrompt()` function assembles the system prompt from multiple sources:
   1. User profile (USER.md)
   2. Agent identity (AGENT.md)
   3. Global instructions (CLAUDE.md)
   4. Nix availability detection
   5. Security rules
   6. Memory keys listing
   7. Skill files

   This compositional approach is better than a monolithic system prompt. banto should follow a similar pattern.

4. **Hot Config Reload (Low Priority for now)** — File mtime polling + SHA-256 hash verification. Changed agents are lazily restarted. This is a good operational pattern but not critical for banto's MVP.

### Technical Design Lessons

1. **NATS as Internal Bus vs WebSocket for Browser** — Praktor's architecture reveals a clear pattern: NATS is for **process-to-process** communication, WebSocket is for **server-to-browser** communication. The gateway bridges between them. banto doesn't need NATS because it doesn't have separate container processes communicating over a network. nixos-containers on the same host can use simpler IPC. But the **separation of concerns** is worth noting: the message bus between orchestrator and agents should be independent of the browser push mechanism.

2. **IPC Between Container and Host (Architecture Decision)** — Praktor uses NATS request-reply for container-to-host communication. banto's nixos-containers don't have the same networking model as Docker, so this pattern needs adaptation. Options for banto:
   - **Unix domain socket** — Most natural for nixos-containers. The host creates a socket, bind-mounts it into the container.
   - **HTTP** — Container calls back to host via HTTP on a known address.
   - **NATS** — Could embed NATS like Praktor, but adds complexity for a single-host setup.

   Recommendation: Unix domain socket for the MVP. It's the simplest, lowest-latency option for nixos-containers on the same host.

3. **Lazy Container Startup** — Praktor only starts containers when a message arrives. Containers are reaped after idle timeout. This is a good pattern for banto: sessions should only start containers when needed and clean up after inactivity.

4. **Agent Registry Pattern** — Praktor has a registry that syncs YAML config to the DB and resolves agent configuration. This is a layer between config and runtime that handles defaults, model resolution, and workspace assignment. banto should have something similar between project/task config and session execution.

### UX Pattern Lessons

1. **Telegram as Primary I/O is limiting** — banto is browser-first. The Telegram bot limits Praktor's UI — you can't see what agents are doing in real-time from the web dashboard. banto's terminal view is a better approach for monitoring agent activity.

2. **Manual Fetch + State Management** — Praktor does manual `fetch()` calls in components. banto uses TanStack Query, which is significantly better for caching, refetching, and state management.

3. **Inline Styles** — Praktor's UI uses all inline styles. banto uses Tailwind CSS, which is a better choice for maintainability.

### Business & Ecosystem Lessons

1. **Docker dependency** — banto uses nixos-containers by design. Docker would be a regression in terms of NixOS integration. nixos-containers share the host's Nix store, making package management trivial without the nix-in-Docker complexity Praktor faces.

2. **Nix advantage** — banto は nixos-container を使うため Nix は標準装備。Praktor の「nix_enabled フラグ + pgrep で daemon 検出 + system prompt 注入」は不要で、NixOS container なら declarative configuration で依存を定義し、nix-collect-garbage を定期実行するだけでよい。banto のアドバンテージ。

3. **Zero community signal** — With only Dependabot issues and 8 stars, Praktor has no community validation. Its patterns are worth studying from a code perspective, but there is no evidence of real-world adoption or user satisfaction beyond the single maintainer.

---

## Sources

- https://github.com/mtzanidakis/praktor
