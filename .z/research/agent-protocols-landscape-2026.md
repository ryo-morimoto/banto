# Agent Communication & Orchestration Protocols Landscape (March 2026)

Date: 2026-03-07
Sources:
- https://agentclientprotocol.com/protocol/overview
- https://github.com/agentclientprotocol/agent-client-protocol
- https://modelcontextprotocol.io/specification/2025-11-25
- https://developers.openai.com/codex/app-server/
- https://code.claude.com/docs/en/headless
- https://platform.claude.com/docs/en/agent-sdk/typescript
- https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
- https://docs.ag-ui.com/

This document surveys every emerging protocol and standard relevant to banto's use case: a self-hosted dashboard that spawns and monitors multiple CLI coding agents (Claude Code, OpenCode, Codex) on a local machine.

---

## 1. Agent Client Protocol (ACP) — Zed

**What it is:** An open protocol (Apache 2.0) standardizing communication between code editors and coding agents. JSON-RPC 2.0 over stdio. Created by Zed in August 2025 with Google (Gemini CLI) as the reference implementation. Current version: v0.11.0 (March 4, 2026). SDKs in Rust, TypeScript, Python, Kotlin.

**Spec maturity:** Early but rapidly iterating. 888 commits, 2.3k stars. Active development with JetBrains partnership.

**Transport:** stdio only (JSON-RPC 2.0 over stdin/stdout pipes). HTTP transport is being discussed but not yet available.

**Core methods:**

| Method | Direction | Purpose |
|--------|-----------|---------|
| `initialize` | Client -> Agent | Version/capability negotiation |
| `authenticate` | Client -> Agent | Credential validation |
| `session/new` | Client -> Agent | Create session |
| `session/load` | Client -> Agent | Resume session (optional capability) |
| `session/prompt` | Client -> Agent | Send user message |
| `session/cancel` | Client -> Agent | Interrupt work (notification) |
| `session/set_mode` | Client -> Agent | Switch operating mode |
| `session/update` | Agent -> Client | Progress notifications (message chunks, tool calls, plans, commands) |
| `session/request_permission` | Agent -> Client | Ask for authorization |
| `fs/read_text_file`, `fs/write_text_file` | Agent -> Client | File operations |
| `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` | Agent -> Client | Terminal management |

**Capabilities negotiation:** Single integer PROTOCOL_VERSION (currently 1). Non-breaking additions via capability flags during initialization (e.g., `loadSession: true`, `promptCapabilities.image: true`).

**Who supports it:**
- **Editors:** Zed (native), JetBrains (via AI Assistant), Neovim (via CodeCompanion/avante.nvim), VS Code (ACP Client extension), Eclipse (prototype), marimo notebook, Emacs
- **Agents:** Claude Code, Codex CLI, Gemini CLI, Goose, OpenCode, Kiro CLI, GitHub Copilot, StackPack, Auggie

**Relationship to MCP:** ACP consciously reuses MCP data types. MCP handles "what tools/data agents can access"; ACP handles "where the agent lives in the workflow." They are complementary layers.

**Relevance to banto:**
- HIGH. ACP is the closest thing to a universal agent control protocol for coding agents.
- **Problem:** stdio-only transport. banto would need to spawn each agent as a subprocess and communicate via pipes. This works on a local machine but complicates remote/container scenarios.
- **Problem:** ACP is designed for editor-agent communication. banto is a dashboard, not an editor. ACP expects the client to provide `fs/read_text_file`, `fs/write_text_file`, `terminal/*` methods. banto would need to implement these or proxy them.
- **Opportunity:** If banto implements ACP client, it gets free support for every ACP-compatible agent without agent-specific integration code.

**Recommendation:** IMPLEMENT (high priority). ACP is the path to universal agent support. The stdio transport is fine for banto's local, self-hosted model. Implement the ACP client interface, providing file system and terminal operations. This gives banto automatic support for Claude Code, Codex, Gemini CLI, OpenCode, Goose, and any future ACP agent.

---

## 2. Model Context Protocol (MCP) — Anthropic / Linux Foundation

**What it is:** A protocol standardizing how AI agents connect to data sources and tools. Originally by Anthropic (November 2024), donated to the Linux Foundation's Agentic AI Foundation in December 2025. Founding members: Anthropic, Block, OpenAI, AWS, Google, Microsoft.

**Spec versions:**
- **2025-03-26:** Streamable HTTP transport introduced
- **2025-06-18:** Major release (often called "MCP v3"). Added elicitation, structured tool outputs, mandatory OAuth for resource servers, removed JSON-RPC batching, deprecated SSE transport
- **2025-11-25:** URL mode elicitation for OAuth flows
- **~2026-06 (expected):** Next major release targeting stateless transports

**Transport:**
- **stdio:** JSON-RPC 2.0 over stdin/stdout (for local servers)
- **Streamable HTTP:** Replaced SSE. Uses chunked transfer encoding for progressive message delivery. Bidirectional but stateful (session affinity needed).
- Future direction: stateless transports to support load balancing at scale.

**Key capabilities:**

| Feature | Status | Description |
|---------|--------|-------------|
| Tools | Stable | Agent calls server-defined tools |
| Resources | Stable | Server exposes data/files |
| Prompts | Stable | Server provides prompt templates |
| Roots | Stable | Client tells server which directories to focus on |
| Sampling | Stable | Server can request the client's LLM to generate text |
| Elicitation | Stable (2025-06) | Server asks client to collect user input (primitive types only) |
| Structured outputs | Stable (2025-06) | Tool output schemas for efficient context window usage |
| OAuth 2.1 | Stable (2025-06) | Mandatory for resource servers, RFC 8707 Resource Indicators |
| Server discovery | In progress | `.well-known` URLs for server advertisement |

**Adoption:** Extremely broad. Used by Claude Code, OpenAI, Google, all major frameworks (LangGraph, CrewAI, AutoGen). ~200+ public MCP servers.

**Relevance to banto:**
- MEDIUM-HIGH for tool integration (banto could expose MCP tools to agents).
- LOW for agent control. MCP is about connecting agents to tools/data, not about controlling agents.
- **Sampling** is interesting: it lets an MCP server request the client's LLM to do work. Could theoretically be used for agent coordination, but this is not the intended use.
- **Elicitation** could allow banto (as MCP server) to ask agents for status updates, but this is the wrong direction (servers ask clients, not the other way around).
- **OAuth 2.1** is mostly irrelevant for banto's local, self-hosted scenario.
- banto should **be an MCP server** so agents can call banto tools (create tasks, update status, etc.), but MCP is not the control channel for agent lifecycle.

**Recommendation:** IMPLEMENT as MCP server (medium priority). Expose banto's task/project management as MCP tools so any agent can interact with the dashboard. Do not use MCP as the agent control protocol.

---

## 3. Agent-to-Agent Protocol (A2A) — Google / Linux Foundation

**What it is:** An open protocol for inter-agent communication. Initially by Google (April 2025), now under the Linux Foundation. 150+ supporting organizations. Current version: 0.3 (added gRPC support).

**Transport:** HTTP, JSON-RPC, SSE. Version 0.3 added gRPC.

**Key concepts:**
- **Agent Cards:** JSON metadata advertising agent capabilities (like a business card)
- **Task management:** Defined lifecycle states for tasks across agents
- **Context sharing:** Agents pass instructions and context to each other
- **UI negotiation:** Agents adapt output to client UI capabilities

**Adoption:** Strong in enterprise: Adobe, S&P Global, ServiceNow, Microsoft. Growing in frameworks: CrewAI has A2A support, LangGraph maps A2A messageIds.

**Relevance to banto:**
- LOW. A2A is designed for agent-to-agent communication in enterprise multi-agent systems (e.g., a purchasing agent talking to a supplier agent). It's about opaque agents collaborating on business processes.
- banto's agents are coding agents working on the same codebase, not independent services communicating across organizational boundaries.
- A2A's Agent Cards concept is interesting for agent discovery, but ACP already handles this for coding agents.

**Recommendation:** IGNORE for now. Not relevant to banto's use case of orchestrating local CLI coding agents. Revisit only if banto ever needs to coordinate agents across organizational boundaries.

---

## 4. Agent Communication Protocol (ACP) — IBM / Linux Foundation

**NOTE:** This is a DIFFERENT protocol from Zed's Agent Client Protocol, despite sharing the same acronym "ACP." The naming collision is an ongoing source of confusion.

**What it is:** IBM Research's open protocol for agent-to-agent communication. Under the Linux Foundation. RESTful, HTTP-based interfaces for task invocation, lifecycle management, synchronous/asynchronous messaging.

**Key differentiators from A2A:**
- Built-in memory beyond single servers
- Agents can pause and await additional data (enabling long-running tasks, human-in-the-loop, elicitation)

**Relevance to banto:** LOW. Same reasoning as A2A — this is for inter-agent communication between opaque agents, not for controlling local CLI coding agents.

**Recommendation:** IGNORE. Same assessment as A2A.

---

## 5. Claude Code Agent SDK (stream-json protocol)

**What it is:** The official programmatic interface for controlling Claude Code. Available as CLI (`claude -p`), TypeScript SDK (`@anthropic-ai/claude-agent-sdk`), and Python SDK. This is the most mature and well-documented agent control interface of any coding agent.

**Transport:** Claude Code spawns as a subprocess. Communication via stdout (NDJSON stream) and stdin (for streaming input mode). The SDK wraps this into an async generator pattern.

**Key capabilities:**

### Output format (stream-json)
NDJSON stream. Event types:

| Message type | Description |
|-------------|-------------|
| `SDKSystemMessage` (subtype: `init`) | Session initialization: tools, model, permissions, MCP servers, cwd |
| `SDKAssistantMessage` | Complete assistant response (Anthropic `BetaMessage`) |
| `SDKPartialAssistantMessage` (type: `stream_event`) | Streaming tokens (requires `includePartialMessages`) |
| `SDKUserMessage` | User input message |
| `SDKResultMessage` | Final result: success/error, duration, cost, usage, permission denials |
| `SDKStatusMessage` | Status updates |
| `SDKHookStartedMessage`, `SDKHookProgressMessage`, `SDKHookResponseMessage` | Hook lifecycle |
| `SDKToolProgressMessage` | Tool execution progress |
| `SDKToolUseSummaryMessage` | Tool use summaries |
| `SDKAuthStatusMessage` | Authentication status |
| `SDKTaskStartedMessage`, `SDKTaskProgressMessage`, `SDKTaskNotificationMessage` | Background task lifecycle |
| `SDKCompactBoundaryMessage` | Context compaction events |
| `SDKFilesPersistedEvent` | File checkpoint events |
| `SDKRateLimitEvent` | Rate limit notifications |
| `SDKPromptSuggestionMessage` | Predicted next user prompt |

### Input (streaming mode)
`prompt` accepts `AsyncIterable<SDKUserMessage>` for multi-turn conversations. The `streamInput()` method on the Query object allows sending additional messages mid-session.

### Permission handling
The `canUseTool` callback is the key control mechanism:
```typescript
canUseTool(toolName, input, { signal, suggestions, blockedPath, decisionReason, toolUseID, agentID })
  => Promise<{ behavior: 'allow', updatedInput?, updatedPermissions? }
           | { behavior: 'deny', message, interrupt? }>
```

Permission modes: `default`, `acceptEdits`, `bypassPermissions`, `plan`, `dontAsk`.

### Session management
- `listSessions({ dir?, limit? })` — discover past sessions
- `resume` option — resume specific session by ID
- `forkSession` — branch to new session from existing
- `continue` — continue most recent session
- `sessionId` — use specific UUID

### Query object control methods
- `interrupt()` — stop current work
- `setPermissionMode()` — change permissions mid-session
- `setModel()` — change model mid-session
- `rewindFiles(userMessageId)` — restore files to earlier state
- `mcpServerStatus()` — check MCP server health
- `reconnectMcpServer()`, `toggleMcpServer()`, `setMcpServers()` — dynamic MCP management
- `stopTask(taskId)` — stop background tasks
- `close()` — terminate process

### Hook system
18 hook events: `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Notification`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PermissionRequest`, `Setup`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`.

### Custom spawn
`spawnClaudeCodeProcess` option allows running Claude Code in VMs, containers, or remote environments.

**Relevance to banto:** CRITICAL. This is the primary interface for controlling Claude Code. The TypeScript SDK is production-ready, well-documented, and provides everything banto needs: session management, streaming output, permission control, tool monitoring, and lifecycle hooks.

**Recommendation:** IMPLEMENT (highest priority). Use `@anthropic-ai/claude-agent-sdk` directly. This is the first agent banto should integrate. The SDK is TypeScript-native, matches banto's stack, and provides the most granular control of any coding agent.

---

## 6. Codex App Server (JSON-RPC)

**What it is:** OpenAI's bidirectional JSON-RPC protocol powering all Codex surfaces (CLI, VS Code extension, web app). Written in Rust. Well-documented with auto-generated TypeScript and JSON Schema.

**Transport:**
- **stdio (default):** JSONL (JSON-RPC 2.0 lite — omits `"jsonrpc":"2.0"` header)
- **WebSocket (experimental/unsupported):** One JSON-RPC message per text frame. Bounded queues with error code `-32001` for overload.

**Initialization:** `initialize` request + `initialized` notification handshake (similar to LSP/MCP).

**Core methods:**

### Thread management
| Method | Description |
|--------|-------------|
| `thread/start` | Create new conversation |
| `thread/resume` | Continue existing session (returns latest turn inline) |
| `thread/fork` | Branch conversation history |
| `thread/read` | Retrieve stored thread data |
| `thread/list` | Paginated history with filters (searchable by title) |
| `thread/loaded/list` | In-memory thread IDs |
| `thread/archive` / `thread/unarchive` | Manage persistence |
| `thread/compact/start` | Compress conversation history |
| `thread/rollback` | Remove recent turns |
| `thread/unsubscribe` | Disconnect from loaded thread |

### Turn management
| Method | Description |
|--------|-------------|
| `turn/start` | Initiate user request (with threadId, user input) |
| `turn/steer` | Append input to active turn |
| `turn/interrupt` | Cancel in-flight work |

### Streaming notifications
| Event | Description |
|-------|-------------|
| `thread/started` | New thread created |
| `thread/archived` / `thread/unarchived` | Persistence state changes |
| `thread/closed` | Thread unloaded from memory |
| `thread/status/changed` | Runtime status transitions |
| `turn/started` | User input received |
| `turn/completed` | Agent work finished (completed/interrupted/failed) |
| `turn/diff/updated` | Aggregated file changes |
| `turn/plan/updated` | Agent plan revisions |
| `item/started` | Work unit begins |
| `item/completed` | Work unit finishes |
| `item/agentMessage/delta` | Streaming model output |

### Item types
`userMessage`, `agentMessage`, `commandExecution`, `fileChange`, `mcpToolCall`, `dynamicToolCall`, `webSearch`, `enteredReviewMode`, `exitedReviewMode`, `contextCompaction`

### Approval flow
Bidirectional — server pauses turn and sends request to client:
- **Command execution:** `accept`, `acceptForSession`, `decline`, `cancel`, `acceptWithExecpolicyAmendment`
- **File changes:** `accept`, `acceptForSession`, `decline`, `cancel`

### Configuration
Turn-level overrides for: model, reasoning effort, cwd, sandbox policy (`readOnly`, `workspaceWrite`, `dangerFullAccess`, `externalSandbox`), approval policy, personality, output schema.

### Authentication
Three modes: API key, ChatGPT managed OAuth, ChatGPT external tokens.

### Schema generation
`codex app-server generate-ts` (TypeScript) or `codex app-server generate-json-schema` (JSON Schema).

**Relevance to banto:** HIGH. Codex is a primary target agent. The app-server protocol is comprehensive and well-documented. The thread/turn model maps well to banto's task/session model.

**Recommendation:** IMPLEMENT (high priority). Spawn `codex app-server` via stdio and communicate using the JSON-RPC protocol. The protocol is richer than ACP and gives banto full control over Codex's lifecycle. Use `codex app-server generate-ts` to get type-safe bindings.

---

## 7. OpenAI Responses API / Realtime API

**What it is:** OpenAI's consolidated API surface replacing the Assistants API (deprecated August 2026). Responses API is the superset of Chat Completions with built-in tools. Realtime API is for low-latency bidirectional audio streaming.

**Key features:**
- Responses API supports MCP servers natively
- Realtime API is GA with WebSocket/WebRTC transports
- Agents SDK provides orchestration, state management, handoffs
- Handoff pattern: sequential delegation between specialized agents via tool calls

**Relevance to banto:** LOW. These are cloud APIs for building AI applications, not protocols for controlling local CLI agents. banto talks to Codex CLI via the app-server protocol, not through the Responses API.

**Recommendation:** IGNORE for agent control. Potentially useful later if banto wants to call OpenAI models directly for its own AI features.

---

## 8. LangGraph / LangChain Agent Protocols

**What it is:** LangGraph (graph-based agent runtime) and LangChain (orchestration framework) both reached 1.0 in late 2025. They integrate with MCP and A2A. LangGraph provides persistence, human-in-the-loop, and state management.

**Standardization efforts:**
- Standardized `.content_blocks` across LLM providers
- A2A messageId mapping to LangChain message IDs
- MCP integration as the standard tool connection layer
- Oracle's Open Agent Specification (Agent Spec) — declarative, framework-agnostic agent definitions, under discussion for LangGraph integration

**Relevance to banto:** LOW. LangGraph/LangChain are Python-heavy agent building frameworks. banto doesn't build agents — it orchestrates existing CLI agents. No protocol here that banto needs to implement.

**Recommendation:** IGNORE. These are agent-building frameworks, not agent-control protocols.

---

## 9. AutoGen / CrewAI / Magentic-One

**What it is:** Multi-agent frameworks with different communication styles:
- **AutoGen (Microsoft):** Conversational dialogues, group chat patterns. v0.4 with async messaging.
- **CrewAI:** Role-based crew collaboration. Growing A2A support.
- **Magentic-One (Microsoft):** Research framework. Manager + 4 specialist agents.

**Communication patterns:**
- AutoGen: Centralized Group Chat Manager, speaker selection (round-robin/random/auto)
- CrewAI: Crews (autonomous teams) or Flows (event-driven pipelines)
- All frameworks integrating MCP for tool connections

**Relevance to banto:** VERY LOW. These are multi-agent orchestration frameworks for building AI applications. banto orchestrates existing coding agents, not custom agents built with these frameworks. No reusable protocol emerges from these.

**Recommendation:** IGNORE. No protocol to adopt.

---

## 10. AG-UI (Agent-User Interaction Protocol)

**What it is:** An open protocol (MIT) standardizing how agents connect to frontend applications. By CopilotKit. 12k+ GitHub stars. 16 standardized event types. Transport: SSE.

**Event types include:** `TOOL_CALL_START`, `STATE_DELTA`, `MEDIA_FRAME`, `TEXT_MESSAGE_CONTENT`, etc.

**Key features:** Remote agent hosting, real-time streaming via SSE, session management, human-in-the-loop approvals, state synchronization.

**Integrations:** Microsoft Agent Framework, Oracle Open Agent Specification.

**Relevance to banto:** MEDIUM. AG-UI is about the agent-to-frontend connection — exactly what banto's dashboard needs. However, AG-UI assumes agents implement the AG-UI server interface, which coding agents (Claude Code, Codex) do not. banto would need to be a translation layer between agent-specific protocols (ACP, app-server) and AG-UI events for the frontend.

**Recommendation:** WATCH. The event type taxonomy is useful design inspiration for banto's own WebSocket event format. Don't implement the full protocol since coding agents don't speak AG-UI, but borrow the event design patterns.

---

## 11. OASIS / Other Standards

**"Open Agent Standard Interface Specification"** — Does not exist as a published specification. OASIS Open (the standards body) has no agent interface standard.

**Related:**
- **Oasis Security AAM:** Commercial agentic access management framework (not a protocol)
- **Oracle Open Agent Specification (Agent Spec):** Declarative, framework-agnostic agent definition standard. Portable across runtimes. Under discussion for LangGraph/AG-UI integration.
- **W3C AI Agent Protocol Community Group:** Working toward official web standards for agent communication. Specs expected 2026-2027.
- **ANP (Agent Network Protocol):** Mentioned in landscape analyses but not yet prominent.
- **AGP (Agent Gateway Protocol):** Gateway for secure messaging between distributed agents.

**Recommendation:** IGNORE all of these for now. None are relevant to banto's local CLI agent orchestration.

---

## 12. Unix-Native Patterns for CLI Agent Control

**No formal standardization exists** beyond ACP for how CLI agents expose control surfaces.

**Observed patterns:**
- **ACP over stdio:** The emerging de facto standard for coding agents. JSON-RPC 2.0 over stdin/stdout pipes.
- **Codex app-server:** JSON-RPC 2.0 over stdio with its own richer protocol (not ACP).
- **Claude Code Agent SDK:** Spawns Claude Code as subprocess, NDJSON over stdout, typed messages.
- **Princeton SWE-agent ACI:** Purpose-built Agent-Computer Interface for LLM agents performing software engineering. Custom commands replacing raw shell.
- **Cline CLI 2.0:** Frames terminal as "AI Agent Control Plane" using ACP.

**Pattern:** Every major coding agent uses subprocess + stdio + JSON-based messaging. The disagreement is on the message format:
- ACP: JSON-RPC 2.0 with a defined schema
- Codex app-server: JSON-RPC 2.0 lite with a different, richer schema
- Claude Code SDK: NDJSON with Anthropic-specific message types

**Recommendation:** banto needs adapters for each protocol family. ACP covers the broadest set of agents. Codex and Claude Code each have their own richer native protocols that give more control.

---

## Summary: banto Integration Strategy

### Priority matrix

| Protocol | Priority | Action | Rationale |
|----------|----------|--------|-----------|
| Claude Code Agent SDK | P0 | Implement now | TypeScript-native, richest control, primary target agent |
| Codex app-server | P0 | Implement now | Well-documented JSON-RPC, full lifecycle control, primary target agent |
| ACP (Zed) | P1 | Implement next | Universal agent support (OpenCode, Gemini CLI, Goose, future agents) |
| MCP (as server) | P2 | Implement later | Let agents call banto tools (create tasks, report status) |
| AG-UI | Watch | Borrow patterns | Event taxonomy useful for banto's own WebSocket protocol |
| A2A (Google) | Ignore | - | Not relevant to local CLI agent orchestration |
| ACP (IBM) | Ignore | - | Not relevant to local CLI agent orchestration |
| OpenAI Responses/Realtime | Ignore | - | Cloud APIs, not agent control protocols |
| LangGraph/LangChain | Ignore | - | Agent-building frameworks, not control protocols |
| AutoGen/CrewAI | Ignore | - | Agent-building frameworks, not control protocols |
| W3C Agent Protocol | Watch | - | Too early, 2026-2027 timeline |

### Architectural implication

banto's session runner should implement a **provider abstraction** with three concrete providers:

1. **ClaudeCodeProvider** — Uses `@anthropic-ai/claude-agent-sdk` TypeScript SDK directly. Richest integration: streaming, permission control, hooks, session management.

2. **CodexProvider** — Spawns `codex app-server` via stdio, speaks its JSON-RPC protocol. Full thread/turn lifecycle, approval flow, streaming items.

3. **ACPProvider** — Generic ACP client that spawns any ACP-compatible agent via stdio. Implements required client methods (`session/request_permission`, `fs/*`, `terminal/*`). Covers OpenCode, Gemini CLI, Goose, and future agents.

All three share a common interface that banto's dashboard consumes via WebSocket. The WebSocket event format should be inspired by AG-UI's event taxonomy but tailored to coding agent workflows.

### Key insight

There is no single protocol that covers all agents. But the landscape has consolidated:
- **For the "last mile" (editor/dashboard to agent):** ACP is winning, but the two biggest agents (Claude Code, Codex) have richer native protocols.
- **For tools/data:** MCP is the undisputed standard.
- **For agent-to-agent:** A2A is leading but irrelevant to banto.
- **For frontend:** AG-UI is emerging but coding agents don't implement it.

banto's competitive advantage is being the dashboard that can talk to ALL coding agents through their best available protocol, not just a lowest-common-denominator ACP integration.

---

## Sources

- https://agentclientprotocol.com/protocol/overview — ACP protocol specification
- https://github.com/agentclientprotocol/agent-client-protocol — ACP GitHub repo (v0.11.0, Apache 2.0)
- https://zed.dev/acp — Zed ACP landing page
- https://zed.dev/blog/acp-progress-report — ACP progress report
- https://blog.jetbrains.com/ai/2025/10/jetbrains-zed-open-interoperability-for-ai-coding-agents-in-your-ide/ — JetBrains ACP integration
- https://blog.jetbrains.com/ai/2026/01/acp-agent-registry/ — ACP Agent Registry launch
- https://opencode.ai/docs/acp/ — OpenCode ACP support
- https://block.github.io/goose/blog/2025/10/24/intro-to-agent-client-protocol-acp/ — Goose ACP intro
- https://kiro.dev/docs/cli/acp/ — Kiro CLI ACP support
- https://modelcontextprotocol.io/specification/2025-11-25 — MCP spec 2025-11-25
- http://blog.modelcontextprotocol.io/posts/2025-11-25-first-mcp-anniversary/ — MCP one year anniversary
- http://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future/ — MCP transport future
- https://developers.openai.com/codex/app-server/ — Codex app-server protocol docs
- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md — Codex app-server README
- https://openai.com/index/unlocking-the-codex-harness/ — Codex app-server architecture blog
- https://www.infoq.com/news/2026/02/opanai-codex-app-server/ — InfoQ coverage of Codex app-server
- https://code.claude.com/docs/en/headless — Claude Code headless/SDK CLI docs
- https://platform.claude.com/docs/en/agent-sdk/typescript — Claude Code TypeScript Agent SDK reference
- https://platform.claude.com/docs/en/agent-sdk/permissions — Claude Code permission system
- https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/ — Google A2A announcement
- https://cloud.google.com/blog/products/ai-machine-learning/agent2agent-protocol-is-getting-an-upgrade — A2A v0.3 upgrade
- https://github.com/a2aproject/A2A — A2A GitHub repo
- https://www.ibm.com/think/topics/agent-communication-protocol — IBM ACP overview
- https://docs.ag-ui.com/ — AG-UI protocol docs
- https://github.com/ag-ui-protocol/ag-ui — AG-UI GitHub repo
- https://getstream.io/blog/ai-agent-protocols/ — Protocol landscape overview
- https://www.ruh.ai/blogs/ai-agent-protocols-2026-complete-guide — 2026 protocol guide
- https://arxiv.org/html/2505.02279v1 — Academic survey of agent interoperability protocols
