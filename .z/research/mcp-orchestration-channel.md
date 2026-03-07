# MCP as Orchestration/Communication Channel Research

Date: 2026-03-07
Sources:
- https://code.claude.com/docs/en/permissions
- https://modelcontextprotocol.io/specification/2025-11-25
- https://modelcontextprotocol.io/specification/2025-11-25/client/sampling
- https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
- https://opencode.ai/docs/mcp-servers/
- https://developers.openai.com/codex/mcp
- https://github.com/anthropics/claude-code/issues/1175

Research into whether MCP can serve as a control/communication channel between an orchestration dashboard (banto) and coding agents (Claude Code, OpenCode, Codex CLI), potentially replacing or supplementing PTY-based monitoring.

---

## 1. banto as MCP Server

If banto registers as an MCP server for Claude Code, it can expose tools that the agent calls during execution. This is the primary integration path.

### What tools could banto expose?

Tools the agent would call back to banto with:

| Tool | Purpose |
|------|---------|
| `report_status` | Agent reports current state (working, blocked, idle, done) |
| `report_progress` | Agent reports what it's doing ("editing file X", "running tests") |
| `request_context` | Agent asks banto for task details, acceptance criteria, related files |
| `request_permission` | Agent asks banto to approve a dangerous operation |
| `report_completion` | Agent reports task completion with summary/diff |
| `report_error` | Agent reports an error it can't recover from |
| `get_task_details` | Agent fetches the full task spec from banto's DB |
| `list_related_tasks` | Agent discovers related/dependent tasks |

### How it works

1. banto starts an MCP server (Streamable HTTP transport, see section 6)
2. Claude Code is launched with `--mcp-config` pointing to banto's MCP server
3. The agent's system prompt (via CLAUDE.md or task prompt) instructs it to call banto tools for status reporting
4. banto receives tool calls = real-time visibility into agent state

### Key limitation

The agent calls tools only when the LLM decides to. There's no guaranteed heartbeat unless the system prompt strongly instructs periodic status reporting. The agent may go silent during long operations. This is fundamentally different from PTY monitoring which gives continuous output.

### Workaround: Hooks + MCP hybrid

Claude Code hooks (PreToolUse, PostToolUse, Stop, Notification) fire deterministically. A hook script can call banto's HTTP API directly, providing guaranteed state updates independent of LLM behavior. Combine hooks for heartbeat/lifecycle events and MCP tools for rich semantic communication.

---

## 2. --permission-prompt-tool

### How it works

Claude Code has a `--permission-prompt-tool` flag that delegates ALL permission decisions to an MCP tool. This is a three-layer system:

1. **Layer 1: Static Allow** -- `allowedTools` in settings.json. If matched, tool is allowed immediately.
2. **Layer 2: Static Deny** -- `disallowedTools`. If matched, tool is denied immediately.
3. **Layer 3: Dynamic Resolution** -- calls the MCP tool specified by `--permission-prompt-tool`.

### Input schema

The MCP tool receives:

```json
{
  "tool_name": "Bash",
  "input": { "command": "rm -rf /tmp/test" }
}
```

### Output schema

The tool must return JSON text content:

```json
// Allow (optionally modify input)
{ "behavior": "allow", "updatedInput": { "command": "rm -rf /tmp/test" } }

// Deny
{ "behavior": "deny", "message": "Destructive command blocked by policy" }
```

### Usage

```bash
claude -p "your task" \
  --mcp-config '{"mcpServers": {"banto": {"url": "http://localhost:3000/mcp"}}}' \
  --permission-prompt-tool mcp__banto__permission_prompt
```

### What banto can do with this

- **Intercept ALL permission requests** that aren't statically allowed/denied
- Present them in the dashboard UI for human approval
- Apply policy rules (block destructive commands, require approval for git push, etc.)
- Modify tool inputs before execution (e.g., add safety flags)
- Log all permission decisions for audit

### Key insight: updatedInput

The `updatedInput` field is powerful. banto can transparently modify what the agent executes. Examples: rewriting file paths, adding `--dry-run` flags, sandboxing commands.

### Existing implementations

- CCO-MCP (Claude Code Oversight): real-time audit/approval dashboard built on this feature
- Community reference impl: https://github.com/mmarcen/test_permission-prompt-tool

---

## 3. MCP for OpenCode

**Yes, OpenCode fully supports MCP servers.**

### Configuration

```json
// opencode.json (project root or ~/.config/opencode/opencode.json)
{
  "mcp": {
    "banto": {
      "type": "remote",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

- Supports both local (stdio) and remote (HTTP) servers
- Per-agent MCP tool restrictions (can limit which agents see which tools)
- CLI management: `opencode mcp enable/disable/remove`
- Tools are automatically available to the LLM alongside built-in tools

### Same pattern works

banto can expose the same MCP tools to OpenCode. The agent prompt instructs it to call `report_status`, `get_task_details`, etc. OpenCode follows MCP naming: `mcp__banto__report_status`.

### No --permission-prompt-tool equivalent found

OpenCode does not appear to have a direct equivalent to Claude Code's `--permission-prompt-tool` for delegating permission decisions to an MCP tool. Permission handling may need to use OpenCode's own permission system.

---

## 4. MCP for Codex CLI

**Yes, Codex CLI supports MCP servers.**

### Configuration

```toml
# ~/.codex/config.toml or .codex/config.toml (project-scoped)
[mcp_servers.banto]
transport = "streamable-http"
url = "http://localhost:3000/mcp"
```

- Supports stdio and Streamable HTTP transports
- CLI management: `codex mcp add/remove`
- Tools exposed alongside built-in tools
- OAuth support for authenticated MCP servers

### Codex as MCP server

Codex can also run as an MCP server (`codex mcp serve`), exposing `codex()` and `codex-reply()` tools. This means banto could potentially orchestrate Codex through MCP in both directions.

### Same pattern works

banto exposes tools via MCP, Codex agents call them. The prompt instructs the agent to report status through banto's tools.

---

## 5. Bidirectional MCP

### MCP is bidirectional by design

MCP uses JSON-RPC 2.0, which is inherently bidirectional. The protocol supports:

**Client -> Server (standard):**
- `tools/call` -- agent calls server tools
- `resources/read` -- agent reads server resources
- `prompts/get` -- agent gets prompt templates

**Server -> Client (reverse):**
- `sampling/createMessage` -- server requests LLM completion from client
- `elicitation/create` -- server requests user input through client UI
- `roots/list` -- server asks what directories client has access to
- `notifications/*` -- server pushes notifications to client

### Sampling: Server-initiated LLM calls

An MCP server can ask the host to run an LLM completion. The server sends `sampling/createMessage` with messages, model preferences, and optional tools. The client's LLM processes the request and returns a response. This enables recursive/nested agent behaviors initiated by the server.

**Relevance to banto:** banto could theoretically use sampling to ask the agent's LLM to summarize its current state, or to re-evaluate a decision. However, this requires the client (Claude Code) to declare sampling capability, and current support is unclear.

### Elicitation: Server-initiated user input

An MCP server can request user input through the client. Two modes:
- **Form mode:** structured data collection (JSON schema)
- **URL mode:** redirect user to external URL (for sensitive data, OAuth)

**Relevance to banto:** When the agent hits a decision point, banto's MCP server could use elicitation to present choices in the dashboard UI rather than in the terminal.

### Notifications: Server push

MCP servers can push notifications:
- `notifications/progress` -- progress updates with token tracking
- `notifications/resources/updated` -- resource change alerts
- `notifications/tools/list_changed` -- tool capability changes
- `notifications/elicitation/complete` -- elicitation completion

### Tasks primitive (Nov 2025 spec)

The November 2025 spec added a Tasks primitive for long-running async operations. A server can create a task, return a handle, publish progress updates, and deliver results when complete. This shifts MCP toward workflow orchestration.

### Limitation: Push is notification-only, not full duplex

While MCP servers can push notifications, they cannot arbitrarily interrupt the agent's execution flow. Notifications are informational. The agent processes them when it chooses to (or the client may display them). This is NOT the same as a true event-driven push where the server controls agent behavior.

**Bottom line:** MCP is bidirectional for tool calls and notifications, but the agent (client) still drives the conversation. The server can request things (sampling, elicitation) but the client decides whether to honor them. For banto, the practical pattern is: agent calls banto tools (pull), banto responds with instructions/data (response). True server-push to control agent behavior is limited.

---

## 6. MCP Transport Options

### stdio
- Agent spawns banto as a child process; communication via stdin/stdout
- Lowest latency (microsecond-level)
- Only works when agent and server are on the same machine
- **Not suitable for banto**: banto is a long-running dashboard server, not a per-session child process

### SSE (Server-Sent Events)
- **Deprecated** as of spec 2025-03-26
- Required two endpoints (GET for stream, POST for messages)
- Do not use for new implementations

### Streamable HTTP (recommended)
- Single HTTP endpoint
- Supports both request-response and streaming (optional SSE upgrade)
- Stateless or stateful (optional `Mcp-Session-Id` header)
- Works behind load balancers, scales to multiple instances
- **Best fit for banto**: long-running server, multiple concurrent agent connections, standard HTTP infrastructure

### Recommendation for banto

**Streamable HTTP** is the clear choice:
- banto already runs an HTTP server (Elysia)
- Multiple agents connect to the same banto instance
- No child process management needed
- Standard HTTP means it works across network boundaries
- Session ID support for correlating agent sessions with banto tasks

---

## Key Question: Can MCP Replace PTY Monitoring?

### What PTY gives you
- Real-time character-by-character terminal output
- Full visibility into everything the agent does (commands, output, errors)
- Works regardless of agent behavior (passive observation)
- User can type into the terminal

### What MCP gives you
- Structured, semantic data (not raw terminal output)
- Agent explicitly reports what it's doing (when instructed)
- Permission interception with `--permission-prompt-tool`
- Rich data types (JSON, not text parsing)
- Works across agent implementations (Claude Code, OpenCode, Codex)

### Verdict: Complement, not replace

MCP cannot fully replace PTY monitoring because:

1. **Gaps in reporting**: The agent only calls MCP tools when the LLM decides to. Long operations produce no MCP traffic. PTY gives continuous output.
2. **No terminal interaction**: MCP doesn't provide a terminal UI. If the user needs to type into the agent's session, they need a PTY.
3. **Agent-dependent**: The agent must be instructed (via prompt) to call banto's tools. If the prompt fails or the agent ignores it, banto gets nothing.

But MCP adds capabilities PTY cannot:

1. **Structured data**: `report_status({ state: "testing", file: "auth.ts" })` vs parsing "Running tests..." from terminal output.
2. **Permission control**: `--permission-prompt-tool` gives banto real control over agent actions.
3. **Cross-agent**: Same MCP interface works for Claude Code, OpenCode, and Codex.
4. **Task context**: Agent can pull task details from banto instead of relying on the initial prompt only.

### Recommended architecture

**Hooks + MCP + optional PTY:**

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Lifecycle events | Claude Code hooks (PreToolUse, PostToolUse, Stop, etc.) | Guaranteed heartbeat, tool-call logging |
| Semantic communication | MCP tools (report_status, get_task_details) | Rich structured data exchange |
| Permission control | --permission-prompt-tool | Intercept and approve/deny agent actions |
| Terminal access | PTY (optional, for debugging) | Raw output visibility, user interaction |

This layered approach gives banto:
- **Guaranteed visibility** via hooks (deterministic, no LLM dependency)
- **Rich communication** via MCP tools (structured, semantic)
- **Control** via permission-prompt-tool (approve/deny/modify actions)
- **Fallback** via PTY (when you need to see raw output or interact)

---

## Learnings for banto

### What this enables
- banto can be a single MCP server that all agents (Claude Code, OpenCode, Codex) connect to
- Permission control via --permission-prompt-tool is production-ready for Claude Code
- Hooks provide the deterministic heartbeat that MCP alone cannot guarantee
- Streamable HTTP transport fits banto's existing Elysia server architecture

### Technical design lessons
- MCP Streamable HTTP endpoint can coexist with banto's existing REST API
- Session ID in MCP maps naturally to banto's session concept
- The `updatedInput` capability in permission-prompt-tool enables transparent input modification (powerful for sandboxing)
- Elicitation could replace custom WebSocket flows for user-approval workflows

### What to build first
1. MCP Streamable HTTP endpoint in banto (Elysia route)
2. `get_task_details` and `report_status` tools (minimum viable MCP surface)
3. `permission_prompt` tool + `--permission-prompt-tool` integration for Claude Code
4. Hook scripts that POST lifecycle events to banto's API
5. PTY remains for terminal viewing in the dashboard (not replaced by MCP)

---

## Sources

- https://code.claude.com/docs/en/permissions -- Claude Code permission system and --permission-prompt-tool
- https://modelcontextprotocol.io/specification/2025-11-25 -- MCP specification (Nov 2025)
- https://modelcontextprotocol.io/specification/2025-11-25/client/sampling -- MCP sampling (server-initiated LLM calls)
- https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation -- MCP elicitation (server-initiated user input)
- https://opencode.ai/docs/mcp-servers/ -- OpenCode MCP server support
- https://developers.openai.com/codex/mcp -- Codex CLI MCP support
- https://github.com/anthropics/claude-code/issues/1175 -- permission-prompt-tool documentation request
- https://www.vibesparking.com/en/blog/ai/claude-code/docs/cli/2025-08-28-outsourcing-permissions-with-claude-code-permission-prompt-tool/ -- permission-prompt-tool guide
- https://lobehub.com/mcp/onegrep-cco-mcp -- CCO-MCP (Claude Code Oversight) dashboard
- https://github.com/disler/claude-code-hooks-multi-agent-observability -- Multi-agent observability via hooks
- https://blog.marcnuri.com/ai-coding-agent-dashboard -- Agent dashboard architecture
- https://dev.to/zrcic/understanding-mcp-server-transports-stdio-sse-and-http-streamable-5b1p -- MCP transport comparison
- https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http/ -- SSE deprecation rationale
- https://ankitmundada.medium.com/mcp-has-notifications-so-why-cant-your-agent-watch-your-inbox-bb688fde7ac5 -- MCP notification limitations
