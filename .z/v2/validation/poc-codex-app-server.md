# PoC: Codex App-Server

## Hypothesis

Codex CLI exposes an `app-server` subcommand that speaks JSON-RPC 2.0 over stdio, providing structured methods for turn management, thread resume, approval flows, and token usage tracking. This would allow banto to control Codex programmatically without PTY scraping.

## Environment

- codex-cli 0.111.0 (installed via Nix)
- `codex app-server` subcommand confirmed present (marked `[experimental]`)
- JSON Schema generated via `codex app-server generate-json-schema --out <dir>`

## Research Findings

### Protocol Overview

The Codex App Server is a **bidirectional JSON-RPC 2.0 protocol** over stdio (JSONL). It is the same protocol that powers the VS Code extension, the web app, and the CLI itself. OpenAI published a detailed architecture description in February 2026.

Key architectural components:
1. **stdio reader** - reads JSONL from stdin
2. **message processor** - translates JSON-RPC requests into Codex core operations
3. **thread manager** - manages core sessions (threads)
4. **core threads** - the actual agent execution

Transport options:
- `stdio://` (default) - JSON-RPC over stdin/stdout as JSONL
- `ws://IP:PORT` (experimental, unsupported) - WebSocket transport

**Important wire format note**: The `"jsonrpc":"2.0"` header is **omitted** on the wire (unlike standard JSON-RPC 2.0).

### Initialization Handshake

Clients must send `initialize` request before any other method, then acknowledge with `initialized` notification. Requests before initialization receive a "Not initialized" error.

### Primitives

- **Item**: Atomic unit of I/O with lifecycle: `item/started` -> deltas -> `item/completed`
- **Turn**: Sequence of items from a single unit of agent work
- **Thread**: Durable container for an ongoing session with persistence, resume, fork, and archival

### Client Request Methods (Exhaustive)

From the generated JSON schema:

**Thread lifecycle:**
- `thread/start` - create new thread (params: cwd, model, approvalPolicy, sandbox, personality, etc.)
- `thread/resume` - resume existing thread by ID (supports resume by threadId, path, or history)
- `thread/fork` - branch thread history into new thread
- `thread/archive` / `thread/unarchive`
- `thread/unsubscribe` - remove connection subscription
- `thread/name/set` / `thread/metadata/update`
- `thread/compact/start` - trigger history compaction
- `thread/rollback` - remove recent turns from context
- `thread/list` / `thread/loaded/list` / `thread/read`

**Turn operations:**
- `turn/start` - begin a turn (required: `input`, `threadId`; optional: model, effort, approvalPolicy, cwd, sandboxPolicy, personality, outputSchema, serviceTier)
- `turn/steer` - append input to an **active** turn (required: `expectedTurnId`, `input`, `threadId`)
- `turn/interrupt` - cancel in-flight turn (required: `threadId`, `turnId`)

**Other:**
- `review/start`, `command/exec`, `model/list`, `config/*`, `account/*`, `skills/*`, `mcpServerStatus/list`, etc.

### Server Notifications (Exhaustive)

**Thread events:**
- `thread/started`, `thread/status/changed`, `thread/archived`, `thread/unarchived`, `thread/closed`
- `thread/name/updated`, `thread/compacted`
- `thread/tokenUsage/updated` - token usage metrics

**Turn events:**
- `turn/started` - turn begins (includes Turn object with id, status)
- `turn/completed` - turn finishes (includes Turn object with status: completed/interrupted/failed)
- `turn/diff/updated` - aggregated file changes
- `turn/plan/updated` - plan step changes

**Item events:**
- `item/started`, `item/completed`
- `item/agentMessage/delta` - streamed agent text
- `item/plan/delta` - streamed plan text
- `item/commandExecution/outputDelta` - command output stream
- `item/fileChange/outputDelta` - tool response
- `item/reasoning/summaryTextDelta`, `item/reasoning/summaryPartAdded`, `item/reasoning/textDelta`
- `item/mcpToolCall/progress`

**Server-initiated requests (approval flows):**
- `item/commandExecution/requestApproval` - approve command execution
- `item/fileChange/requestApproval` - approve file changes
- `item/tool/requestUserInput` - prompt user for tool parameters
- `item/tool/call` - dynamic tool call on client
- `mcpServer/elicitation/request` - MCP elicitation

**Other:**
- `error`, `skills/changed`, `serverRequest/resolved`, `account/*`, `model/rerouted`, `deprecationNotice`, etc.

### Token Usage Schema

`thread/tokenUsage/updated` notification carries `ThreadTokenUsage`:

```json
{
  "threadId": "string",
  "turnId": "string",
  "tokenUsage": {
    "last": {
      "inputTokens": 0,
      "outputTokens": 0,
      "cachedInputTokens": 0,
      "reasoningOutputTokens": 0,
      "totalTokens": 0
    },
    "total": {
      "inputTokens": 0,
      "outputTokens": 0,
      "cachedInputTokens": 0,
      "reasoningOutputTokens": 0,
      "totalTokens": 0
    },
    "modelContextWindow": null  // nullable int64
  }
}
```

**No `cost` field exists anywhere in the schema.** Cost must be calculated client-side from token counts + model pricing.

### Approval Flow Details

**Command execution approval** (`item/commandExecution/requestApproval`):
- Params: `threadId`, `turnId`, `itemId`, `command`, `cwd`, `commandActions`, `proposedExecpolicyAmendment`, `reason`
- Response decisions: `accept`, `acceptForSession`, `decline`, `cancel`, `acceptWithExecpolicyAmendment`

**File change approval** (`item/fileChange/requestApproval`):
- Params: `threadId`, `turnId`, `itemId`, `grantRoot`, `reason`
- Response decisions: `accept`, `acceptForSession`, `decline`, `cancel`

### Mid-Turn Messaging

`turn/steer` is the method for injecting input into an active turn. It requires `expectedTurnId` as a precondition check (fails if turnId doesn't match active turn). This is **not** `turn/start` -- calling `turn/start` during an active turn would likely start a new turn (the existing turn would be interrupted/replaced per `TurnAbortReason: "replaced"`).

### Thread Resume

`thread/resume` accepts:
- `threadId` (primary) - load thread from disk and resume
- Also supports resume by `history` (from memory) or `path` (from disk path)
- Precedence: history > path > threadId
- Optional overrides: model, approvalPolicy, cwd, sandbox, personality, etc.

The response includes a `Turn` object with `items` populated (containing the thread's history). This confirms resume restores prior context.

## Live Test Results

No live test was performed (would require valid OpenAI authentication and API credits). The analysis is based on:
1. `codex --help` and `codex app-server --help` output (confirmed subcommand exists)
2. Generated JSON Schema from `codex app-server generate-json-schema`
3. Official OpenAI documentation at developers.openai.com/codex/app-server/
4. OpenAI engineering blog post (February 2026)

## Assumption Validation

| ID | Assumption | Result | Notes |
|----|-----------|--------|-------|
| B1 | `codex app-server` exists and accepts JSON-RPC 2.0 over stdio | **verified** | Confirmed via CLI help and JSON schema generation. Marked `[experimental]`. Wire format omits `"jsonrpc":"2.0"` header. |
| B2 | RPC methods are `turn/start`, `approval/accept`, `approval/decline`, `turn/cancel`, `thread/resume` | **partially verified** | `turn/start` and `thread/resume` confirmed. Cancel is `turn/interrupt` (not `turn/cancel`). Approval is via server-initiated requests (`item/commandExecution/requestApproval`, `item/fileChange/requestApproval`) with response decisions, not `approval/accept`/`approval/decline` methods. Method names differ from assumed. |
| B3 | app-server stays alive between turns (does not exit on turn completion) | **verified** | Architecture is explicitly a long-lived process with thread manager. Threads persist between turns. `turn/completed` is a notification, not a shutdown signal. |
| B4 | `UsageUpdate` events contain `input_tokens`, `output_tokens`, `cost` fields | **partially verified** | `thread/tokenUsage/updated` contains `inputTokens`, `outputTokens`, `cachedInputTokens`, `reasoningOutputTokens`, `totalTokens` (camelCase, not snake_case). **No `cost` field exists.** Also includes `modelContextWindow`. |
| B5 | `turn/start` during active turn works for mid-session messaging | **falsified** | Mid-turn messaging uses `turn/steer` (not `turn/start`). `turn/start` during an active turn would replace/interrupt the current turn. `turn/steer` requires `expectedTurnId` precondition. |
| B6 | `thread/resume` picks up exactly where a previous thread left off | **verified** | Schema confirms resume by threadId loads from disk. Response includes Turn with populated `items` (history). Supports overriding model, cwd, sandbox, approvalPolicy on resume. |

## Conclusions

The Codex app-server is a **well-designed, production-grade protocol** that closely matches banto's needs. Key design implications for banto's Codex provider:

1. **Wire format**: JSONL over stdio with `"jsonrpc":"2.0"` omitted. banto's RPC client must handle this non-standard framing.

2. **Lifecycle**: `initialize` -> `initialized` -> `thread/start` -> `turn/start` (repeat turns) -> process termination. The server stays alive indefinitely.

3. **Approval model**: Server-initiated requests (reverse direction from typical RPC). banto must implement a response handler that receives approval requests and sends back decisions. This maps well to banto's permission system.

4. **Mid-turn input**: Use `turn/steer` (not `turn/start`) to inject messages during active turns. This is important for banto's UX where users might want to guide the agent mid-execution.

5. **Token tracking**: Available but no cost field. banto must maintain a model pricing table for cost estimation.

6. **Method name corrections needed in architecture docs**:
   - `turn/cancel` -> `turn/interrupt`
   - `approval/accept` / `approval/decline` -> server-initiated `requestApproval` + client response with decision
   - Field names are camelCase, not snake_case

7. **Schema generation**: `codex app-server generate-json-schema` and `generate-ts` can be used to auto-generate TypeScript types for the RPC client.

## Open Questions

1. **Authentication**: Does app-server work with API key auth, or only ChatGPT managed auth? Need to test `account/login/start` flow.
2. **Backpressure**: Server returns `-32001` when overloaded. How does this manifest under banto's multi-session workload?
3. **Thread persistence**: Where are threads stored on disk? Can banto manage/clean up old threads?
4. **Sandbox interaction**: How does `SandboxMode` interact with banto's worktree-based isolation?
5. **Stability**: The `[experimental]` label -- how stable is this API across codex-cli versions? Is there a versioning/deprecation policy?
6. **`"jsonrpc":"2.0"` omission**: Need to verify whether this means the field is truly absent or just optional. This affects RPC client implementation.
7. **WebSocket transport**: If ws:// becomes stable, it would simplify banto's architecture (no subprocess management needed).

## Sources

- [Codex App Server - OpenAI Developers](https://developers.openai.com/codex/app-server/)
- [Unlocking the Codex harness: how we built the App Server | OpenAI](https://openai.com/index/unlocking-the-codex-harness/)
- [codex-rs/app-server/README.md - GitHub](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenAI Publishes Codex App Server Architecture - InfoQ](https://www.infoq.com/news/2026/02/opanai-codex-app-server/)
- [OpenAI Codex App Server: The Protocol Unifying AI Agent Development](https://www.adwaitx.com/openai-codex-app-server-json-rpc-protocol/)
- Generated JSON Schema from `codex app-server generate-json-schema` (codex-cli 0.111.0)
