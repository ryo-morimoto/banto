# OpenAI Codex CLI Research

Source: https://github.com/openai/codex
Codebase: Rust (codex-rs) with a legacy Node.js CLI (codex-cli, deprecated)
Date: 2026-03-07

## 1. How to Spawn/Launch

### Installation
- npm: `npm install -g @openai/codex`
- Homebrew: `brew install --cask codex`
- Binary downloads from GitHub Releases (macOS arm64/x86_64, Linux x86_64/arm64)

### Interactive TUI (default)
```
codex [PROMPT] [FLAGS]
```
If no subcommand is given, it launches the interactive TUI.

### Non-interactive / Headless Mode (`exec` subcommand)
```
codex exec "your prompt here"
echo "your prompt" | codex exec
codex exec --json "your prompt"
```
Key flags:
- `--json` — JSONL output to stdout (one event per line), machine-parseable
- `--model` / `-m` — model selection
- `--sandbox` / `-s` — sandbox policy (read-only, workspace-write, danger-full-access)
- `--yolo` / `--dangerously-bypass-approvals-and-sandbox` — skip all approvals
- `--full-auto` — low-friction sandboxed automatic execution
- `--oss` — use local OSS model (ollama/lmstudio)
- `--add-dir` — additional writable directories
- `--skip-git-repo-check` — bypass trusted directory validation
- `-i, --image FILE` — attach images

Without `--json`, only the final assistant message is written to stdout; diagnostics go to stderr.

**Exit codes**: 0 = success, 1 = error during execution.

**Prompt input**: positional argument OR stdin (auto-detected with BOM-aware encoding: UTF-8, UTF-16LE/BE).

### Other Subcommands
- `resume` — reopen a recorded session (with `--last`, `--picker`, or specific SESSION_ID)
- `fork` — branch from an existing session
- `review` — run code review non-interactively
- `app-server` — [experimental] JSON-RPC 2.0 server for rich integrations
- `mcp-server` — run as MCP stdio server
- `login` / `logout` — manage auth
- `cloud` — [experimental] browse Codex Cloud tasks
- `sandbox` — run commands within Codex-provided sandbox
- `completion` — generate shell completions

## 2. How to Detect State

### Internal Protocol (codex-core)
The `Codex` struct exposes:
```rust
pub agent_status: watch::Receiver<AgentStatus>
```
AgentStatus states: **PendingInit**, **Running**, **Completed**, **Errored**, **Shutdown**, **NotFound**

External callers can `subscribe_status()` on a `CodexThread` to watch state transitions.

### Event Stream (codex-protocol)
Events received via `next_event() -> Event`:
- **Lifecycle**: TurnStarted, TurnComplete, TurnAborted, SessionConfigured
- **Content**: AgentMessage, AgentMessageDelta, AgentReasoning, UserMessage
- **Tool use**: ExecCommandBegin/End, McpToolCallBegin/End, WebSearchBegin/End
- **Approvals**: ExecApprovalRequest, ApplyPatchApprovalRequest, RequestUserInput
- **Errors**: Error, Warning, StreamError
- **Metrics**: TokenCount, ModelReroute

### Notification Hooks
Config key: `notify` (array of strings — command to spawn).
Hook fires on **AgentTurnComplete** with a JSON payload as the last CLI argument:
```json
{
  "type": "agent-turn-complete",
  "thread-id": "...",
  "turn-id": "...",
  "cwd": "...",
  "client": "codex-tui",
  "input-messages": [...],
  "last-assistant-message": "..."
}
```
Fire-and-forget execution (stdin/stdout/stderr redirected to /dev/null).

### Hook System (codex-hooks crate)
Two hook events:
1. **AfterAgent** — thread-id, turn-id, input messages, assistant message
2. **AfterToolUse** — tool name, kind (Function/Custom/LocalShell/Mcp), input, success, duration, sandbox info

HookResult: Success | FailedContinue | FailedAbort

### exec --json mode
In non-interactive mode with `--json`, events are streamed as JSONL to stdout — the simplest way for an external tool to monitor progress programmatically.

## 3. How to Send Messages / Control It

### Via codex-core API (Rust, in-process)
```rust
codex.submit(Op::UserInput { ... })
codex.submit(Op::Interrupt)
codex.submit(Op::ExecApproval { ... })
codex.submit(Op::PatchApproval { ... })
codex.submit(Op::Compact)
codex.submit(Op::Undo)
codex.submit(Op::Shutdown)
```
Also: `route_realtime_text_input()` for async text injection.

Submission operations (Op enum):
- UserInput, UserTurn — send messages
- Interrupt — abort current turn
- ExecApproval, PatchApproval — respond to approval requests
- OverrideTurnContext — update session settings
- Compact — compact history
- Undo, ThreadRollback — undo/rollback
- Review — trigger review
- Shutdown — graceful shutdown
- ListMcpTools, RefreshMcpServers, ListSkills, ListCustomPrompts

### Via App Server (JSON-RPC 2.0, experimental)
Launch: `codex app-server`
Transport: **stdio** (newline-delimited JSON, default) or **WebSocket** (experimental)

Protocol:
1. Client sends `initialize` request with metadata
2. Server responds; client sends `initialized` notification
3. Then use:
   - `thread/start` — create new conversation
   - `thread/resume` — reopen existing thread
   - `thread/fork` — branch from existing
   - `turn/start` — send user input, triggers agent generation
   - Approval responses for command execution and file changes
   - `config/read`, `config/mcpServer/reload`
   - `model/list`, `account/read`
   - `skills/list`, `app/list`, `plugin/list`

Server streams notifications:
- `item/started`, `item/completed`, deltas
- `turn/started`, `turn/completed`
- `thread/status/changed`
- Error notifications with classification (ContextWindowExceeded, UsageLimitExceeded, etc.)

Supports **Dynamic Tools** (experimental): define ad-hoc tools at thread start, server calls them via `item/tool/call`.

### Via exec mode
No interactive control — fire-and-forget. Prompt in, result out.

## 4. PTY / Terminal Behavior

### TUI Mode (default)
- Full TUI built with Ratatui (Rust terminal UI framework)
- Uses **alternate screen** by default (can be disabled with `--no-alt-screen` for inline mode in tmux/screen)
- Alternate screen modes: auto, always, never (config: `tui.alternate_screen`)
- Animations, status line, tooltips configurable
- Theme picker available
- Supports voice input (realtime audio)

### exec Mode
- No TUI, no PTY
- stdout: final message only (or JSONL with `--json`)
- stderr: diagnostics
- Suitable for piping and scripting

### App Server Mode
- No TUI
- stdio or WebSocket transport
- Pure JSON-RPC communication

## 5. Configuration

### File Location
`~/.codex/config.toml` (TOML format)
Schema: `codex-rs/core/config.schema.json`

### Key Config Options

**Model**: `model`, `model_provider`, `model_providers` (custom providers with base_url, env_key, headers)
**Sandbox**: `sandbox_mode` (read-only | workspace-write | danger-full-access), `sandbox_workspace_write` (network, writable_roots)
**Approval**: `approval_policy` (untrusted | on-failure | on-request | never)
**Notifications**: `notify` (command array for hook)
**MCP Servers**: `mcp_servers` (map of server configs with command, url, args, env, timeouts)
**Instructions**: `instructions` (system prompt), `developer_instructions` (developer role)
**Profiles**: `profiles` (named config overrides), `profile` (active profile)
**Projects**: `projects` (per-project config)
**State**: `sqlite_home` (SQLite DB location), `log_dir`
**Personality**: `personality` (none | friendly | pragmatic)
**History**: `history.persistence` (save-all | none)
**Reasoning**: `model_reasoning_effort` (none | minimal | low | medium | high | xhigh)
**Web Search**: `web_search` (disabled | cached | live)
**Agents**: `agents` (job_max_runtime_seconds, max_depth, max_threads)

### Environment Variables
- `CODEX_SQLITE_HOME` — override SQLite DB location
- `CODEX_HOME` — base directory

### Project Instructions
Reads `AGENTS.md` from project root (configurable fallback filenames via `project_doc_fallback_filenames`).

## 6. Sandbox / Isolation

### Sandbox Policies
- **DangerFullAccess** — no restrictions
- **WorkspaceWrite** — write only to specified roots, read-only elsewhere, configurable network
- **ReadOnly** — no writes except designated paths
- **ExternalSandbox** — delegates to external system

### Platform Implementations
- **macOS**: Seatbelt (sandbox profiles, `.sbpl` files)
- **Linux**: Bubblewrap (bwrap) + Landlock + seccomp + no_new_privs
- **Windows**: Restricted tokens (in-process)

### Network Control
Configurable per sandbox: allowed/denied domains, SOCKS5 proxy, local binding, Unix sockets.

### CLI Flags
- `--sandbox read-only` / `--sandbox workspace-write` / `--sandbox danger-full-access`
- `--full-auto` — automatic sandbox with low friction
- `--add-dir` — additional writable directories

## 7. Model Support

All models are OpenAI GPT family:
- **gpt-5.4** — latest frontier, 272K context, reasoning (low/medium/high/xhigh)
- **gpt-5.3-codex** — frontier agentic coding, 272K context, parallel tool calls
- **gpt-5.2-codex** — predecessor, 272K context, available on free plans
- **gpt-5.1-codex-max** — deep/fast reasoning, 272K context, no parallel tool calls
- **gpt-5.1-codex** — optimized for codex, hidden from UI

All support: image input, shell commands, code patching, 10K token truncation limit.

### Custom Providers
Via `model_providers` config: any OpenAI-compatible API with custom base_url.
OSS support: `--oss` flag with `--local-provider` (ollama | lmstudio).

## Summary for Dashboard Integration

### Best approach: App Server (JSON-RPC 2.0)
The `codex app-server` subcommand is the intended integration point for external tools:
- Spawn: `codex app-server` (stdio transport)
- Communicate: JSON-RPC 2.0 over stdin/stdout
- Lifecycle: initialize handshake -> thread/start -> turn/start -> stream events -> turn/completed
- State detection: thread/status/changed notifications, AgentStatus watch
- Control: send turns, approve/reject commands and patches, compact, undo

### Alternative: exec mode
For simpler fire-and-forget tasks:
- Spawn: `codex exec --json "prompt"`
- Monitor: parse JSONL from stdout
- No interactive control (no mid-session messages)
- Exit code indicates success/failure

### Notification hooks
For lightweight monitoring without full integration:
- Configure `notify` in config.toml
- Receive JSON payload when agent completes a turn

### Key limitation
There is NO way to attach to a running Codex session from an external process. Each session must be spawned and communicated with from the start via the app-server protocol or exec mode. The `resume` and `fork` subcommands work at the thread/conversation level, not process level.
