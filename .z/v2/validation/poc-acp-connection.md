# PoC: ACP Connection

## Hypothesis

banto's architecture assumes ACP (Agent Client Protocol) can serve as a universal fallback for any ACP-compatible agent, using JSON-RPC 2.0 over stdio. The design in `providers/acp.md` assumed speculative method names (`message/send`, `permission/respond`, `context/updated`, etc.) based on early Zed blog posts. This research validates whether the actual ACP spec matches those assumptions.

---

## Research Findings

### Spec Status

ACP is **far more mature than assumed**. Key facts:

- **Official site**: [agentclientprotocol.com](https://agentclientprotocol.com/) with full protocol documentation
- **GitHub org**: [github.com/agentclientprotocol](https://github.com/agentclientprotocol) (moved from `zed-industries/agent-client-protocol`)
- **Protocol version**: `PROTOCOL_VERSION = 1` (single integer, only increments for breaking changes)
- **Status**: Production-ready. Used in Zed, JetBrains IDEs, Neovim (CodeCompanion, avante.nvim), Emacs, VS Code (community extension), marimo notebooks
- **License**: Apache 2.0
- **Schema source of truth**: `schema.rs` in the spec repo, with generated TypeScript definitions

The protocol is **not draft** -- it is actively used in production by major editors and 28+ agents.

### Available SDKs

| SDK | Package | Version | Notes |
|-----|---------|---------|-------|
| TypeScript | `@agentclientprotocol/sdk` | 0.14.1 | `ClientSideConnection` + `AgentSideConnection` |
| Rust | `agent-client-protocol` | on crates.io | Transport-agnostic (AsyncRead/AsyncWrite) |
| Python | `agentclientprotocol/python-sdk` | on GitHub | Pydantic models from JSON Schema |
| Kotlin | `acp-kotlin` | on GitHub | For JetBrains integration |
| Go | Community | on pkg.go.dev | Third-party |
| Elixir | `acpex` | 0.1.0 | Community |

**Legacy package**: `@zed-industries/agent-client-protocol` (v0.4.5) is deprecated. Migrate to `@agentclientprotocol/sdk`.

### Available Implementations (Agents)

28+ agents in the ACP registry (launched Jan 2026 by JetBrains + Zed):

| Agent | Native ACP? | Notes |
|-------|-------------|-------|
| Gemini CLI | Yes | Reference implementation |
| Claude Code | Adapter | Via Zed's SDK adapter |
| Codex CLI | Adapter | Via `codex-acp` bridge (cola-io/codex-acp) |
| Goose | Yes | Block's open-source agent |
| OpenCode | Yes | SST framework |
| GitHub Copilot CLI | Yes | Public preview (Jan 2026) |
| Cline | Yes | Direct ACP support |
| Kiro CLI | Yes | AWS's agent |
| Qwen Code | Yes | Alibaba |
| OpenHands | Yes | Open-source |
| + 18 more | Various | See registry at agentclientprotocol.com |

### Headless ACP Client (Key Discovery)

**acpx** ([github.com/openclaw/acpx](https://github.com/openclaw/acpx)) is a headless CLI client for ACP sessions, designed for exactly banto's use case:
- Scriptable ACP client (no editor required)
- Persistent sessions, multi-turn conversations
- Permission controls
- Works with Codex, Claude, Gemini, OpenCode, etc.
- Alpha stage, but demonstrates that **non-editor ACP clients are viable**
- Install: `npm install -g acpx@latest`

### Protocol Details (Actual Method Names)

The actual ACP spec uses **different method names** than assumed in `providers/acp.md`.

#### Agent-Handled Methods (Client -> Agent)

| Method | Required? | Description |
|--------|-----------|-------------|
| `initialize` | Yes | Capability negotiation |
| `authenticate` | Optional | Auth flow |
| `session/new` | Yes | Create new session |
| `session/prompt` | Yes | Send user message |
| `session/cancel` | Yes | Cancel ongoing operation (notification) |
| `session/load` | Optional | Load existing session (requires `loadSession` capability) |
| `session/set_mode` | Optional | Switch agent mode (ask/architect/code) |
| `session/set_config_option` | Optional | Change session config |
| `session/resume` | Unstable | Resume without replaying history |
| `session/list` | Unstable | List existing sessions |
| `session/fork` | Unstable | Fork session for branching |

#### Client-Handled Methods (Agent -> Client)

| Method | Required? | Description |
|--------|-----------|-------------|
| `session/update` | Yes | Streaming updates (messages, tool calls, thoughts) |
| `session/request_permission` | Yes | Request user authorization |
| `fs/read_text_file` | Optional | File read (requires `fs.readTextFile` capability) |
| `fs/write_text_file` | Optional | File write (requires `fs.writeTextFile` capability) |
| `terminal/create` | Optional | Terminal access (requires `terminal` capability) |
| `terminal/output` | Optional | Get terminal output |
| `terminal/release` | Optional | Release terminal |
| `terminal/wait_for_exit` | Optional | Wait for terminal completion |
| `terminal/kill` | Optional | Kill terminal command |

#### Session Update Types (via `session/update` notification)

| Update Type | Description |
|-------------|-------------|
| `agent_message_chunk` | Streaming text response |
| `user_message_chunk` | Echoed user message |
| `agent_thought_chunk` | Agent reasoning/thinking |
| `tool_call` | Tool invocation announcement (pending -> in_progress -> completed/failed) |
| `tool_call_update` | Tool execution progress |
| `plan` | Agent's plan with entries (status: pending/in_progress/completed) |

#### Permission Flow

```
Agent -> Client: session/request_permission
  params: { sessionId, toolCall, options: [{ optionId, name, kind }] }
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always"

Client -> Agent: response
  result: { outcome: { outcome: "selected" | "cancelled", optionId } }
```

#### Initialize Flow

```json
// Client -> Agent
{
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": { "readTextFile": true, "writeTextFile": true },
      "terminal": true
    },
    "clientInfo": { "name": "banto", "version": "1.0.0" }
  }
}

// Agent -> Client
{
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": { "image": true, "embeddedContext": true },
      "sessionCapabilities": { "resume": {}, "fork": {} },
      "mcpCapabilities": { "http": true }
    },
    "agentInfo": { "name": "opencode", "version": "1.0.0" },
    "authMethods": []
  }
}
```

#### PromptResponse (Turn Completion)

```json
{
  "result": {
    "stopReason": "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled"
  }
}
```

### Context Tracking & Token Usage

**Not in the core spec.** The spec has no `context/updated` or `usage/updated` methods. However:

- Token usage is being proposed as an `extNotification` (extension notification). Gemini CLI has an open issue (#19249) for `thread/tokenUsage/updated` extNotification.
- `codex-acp` aggregates token counts from Codex events and exposes them via `/status` slash command.
- ACP supports custom underscore-prefixed methods and `_meta` fields for extensions.
- **Conclusion**: Context tracking must be agent-specific or use extension notifications. Not standardized yet.

---

## Assumption Validation

| ID | Assumption | Result | Notes |
|----|-----------|--------|-------|
| C1 | ACP uses JSON-RPC 2.0 over stdio with line-delimited framing | **Verified** | Confirmed: newline-delimited JSON over stdin/stdout. Agents run as subprocesses. |
| C2 | `initialize` returns `{ capabilities }` declaring resume, permission, context tracking | **Partially verified** | `initialize` returns `agentCapabilities` with `loadSession`, `promptCapabilities`, `sessionCapabilities` (resume, fork). Permission is baseline (always available). Context tracking is **not** part of capabilities -- falsified. |
| C3 | Event method names are `message/created`, `tool/called`, `permission/requested`, etc. | **Falsified** | Actual names are completely different. All events flow through `session/update` notification with typed update objects (`agent_message_chunk`, `tool_call`, `tool_call_update`). Permission is `session/request_permission` (a method, not notification). No `message/created` or `tool/called` methods exist. |
| C4 | ACP agents emit `context/updated` if they support context tracking | **Falsified** | No `context/updated` in the spec. Token usage/context tracking is not standardized. Extension notifications (`extNotification`) are the emerging pattern. |
| C5 | `permission/respond` is processed synchronously by agent | **Partially verified** | Permission uses `session/request_permission` (agent -> client request), and the client responds with the standard JSON-RPC response containing `{ outcome: { outcome, optionId } }`. It is synchronous in the JSON-RPC sense (request-response pair). But the method name and response format are different from assumed. |
| C6 | At least one ACP-compatible agent exists and can be tested end-to-end | **Verified** | 28+ agents in the ACP registry. Gemini CLI is the reference implementation. `acpx` provides a headless CLI client for testing. TypeScript SDK (`@agentclientprotocol/sdk`) provides `ClientSideConnection` for building custom clients. |

---

## Impact on `providers/acp.md`

The existing design has **correct architecture but wrong method names**. Required changes:

| Current (Wrong) | Actual (Correct) | Impact |
|-----------------|-------------------|--------|
| `message/send` | `session/prompt` | Method rename |
| `message/created` event | `session/update` notification (type: `agent_message_chunk`) | Complete restructure of event handling |
| `tool/called` event | `session/update` notification (type: `tool_call`) | Merged into single update handler |
| `permission/requested` event | `session/request_permission` method (agent -> client) | Direction reversed: client must handle incoming request |
| `permission/respond` | JSON-RPC response to `session/request_permission` | Not a separate method call, just a response |
| `context/updated` event | Not in spec | Remove or implement as extension |
| `usage/updated` event | Not in spec | Remove or implement as extension |
| `shutdown` | Not in spec | Use process kill (SIGTERM) |
| `capabilities.permissions` | Baseline (always available) | Simplify |
| `capabilities.contextTracking` | Not in spec | Remove |

### Key Architectural Difference

The biggest design change: banto assumed ACP events are **push notifications** from agent to client (like Codex). In reality, ACP uses a **hybrid model**:

- `session/update`: Agent pushes streaming updates (notifications, no response expected)
- `session/request_permission`: Agent sends a **request** to client, expecting a **response** (synchronous handshake)
- `fs/*`, `terminal/*`: Agent sends **requests** to client for file/terminal access

This means banto's ACP client must implement **both** sides: it sends requests to the agent AND handles incoming requests from the agent. The TypeScript SDK's `ClientSideConnection` handles this pattern.

---

## Conclusions

### ACP should remain in v1 scope

ACP is significantly more mature than assumed when the architecture was designed. Key reasons:

1. **Production-ready ecosystem**: 28+ agents, 6+ editors, official SDKs in 4+ languages
2. **TypeScript SDK available**: `@agentclientprotocol/sdk` v0.14.1 with `ClientSideConnection` -- exactly what banto needs
3. **Headless client precedent**: `acpx` proves non-editor ACP clients work
4. **Better than PTY scraping**: Structured protocol gives reliable tool call, permission, and message data
5. **Low implementation cost**: SDK handles JSON-RPC framing, message routing, capability negotiation

### Recommended approach

1. **Use `@agentclientprotocol/sdk`** instead of building a raw JSON-RPC client
2. **Implement `ClientSideConnection`** handlers for:
   - `session/request_permission` -> permission UI
   - `session/update` -> event ledger + UI updates
   - `fs/*` -> file operations (optional, can delegate to agent)
   - `terminal/*` -> terminal access (optional)
3. **Drop context tracking** from ACP provider -- not standardized
4. **Use `session/load` or `session/resume`** for crash recovery (capability-dependent)
5. **Test with Gemini CLI first** (reference implementation, no adapter needed)

---

## Open Questions

1. **banto as non-editor client**: ACP is designed for editors. banto is a dashboard. Does the `fs/*` and `terminal/*` client-side API make sense for banto, or should we skip those capabilities? Agents that require file access might not work without `fs` support.
2. **Extension notifications**: How stable is the `extNotification` pattern for token usage? Should banto listen for these speculatively?
3. **Adapter agents**: Claude Code and Codex use adapters (not native ACP). How reliable are these adapters? Are they maintained by Zed or community?
4. **Session persistence**: `session/load` vs `session/resume` -- which agents support which? How does this map to banto's crash recovery model?
5. **SDK compatibility with Bun**: The TypeScript SDK targets Node.js. Has anyone tested it with Bun runtime?
6. **Agent discovery**: Should banto integrate with the ACP registry for agent discovery, or keep manual configuration?

---

## Sources

- [Agent Client Protocol - Official Site](https://agentclientprotocol.com/)
- [Protocol Overview](https://agentclientprotocol.com/protocol/overview)
- [Initialization](https://agentclientprotocol.com/protocol/initialization)
- [Prompt Turn](https://agentclientprotocol.com/protocol/prompt-turn)
- [Tool Calls](https://agentclientprotocol.com/protocol/tool-calls)
- [Schema](https://agentclientprotocol.com/protocol/schema)
- [Session Modes](https://agentclientprotocol.com/protocol/session-modes)
- [GitHub - agentclientprotocol/agent-client-protocol](https://github.com/agentclientprotocol/agent-client-protocol)
- [GitHub - agentclientprotocol/typescript-sdk](https://github.com/agentclientprotocol/typescript-sdk)
- [@agentclientprotocol/sdk on npm](https://www.npmjs.com/package/@agentclientprotocol/sdk)
- [ACP Registry - Zed Blog](https://zed.dev/blog/acp-registry)
- [JetBrains ACP Registry Blog](https://blog.jetbrains.com/ai/2026/01/acp-agent-registry/)
- [Zed - External Agents](https://zed.dev/docs/ai/external-agents)
- [GitHub - openclaw/acpx](https://github.com/openclaw/acpx)
- [Gemini CLI - Token Usage extNotification Issue #19249](https://github.com/google-gemini/gemini-cli/issues/19249)
- [GitHub - cola-io/codex-acp](https://github.com/cola-io/codex-acp)
- [Goose ACP Blog](https://block.github.io/goose/blog/2025/10/24/intro-to-agent-client-protocol-acp/)
- [ACP Community Progress - Zed Blog](https://zed.dev/blog/acp-progress-report)
- [Session Fork RFD](https://agentclientprotocol.com/rfds/session-fork)
