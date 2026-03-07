# OpenCode (opencode-ai/opencode) Research

Date: 2026-03-07
Sources:
- https://github.com/opencode-ai/opencode
- Source code analysis (cmd/root.go, internal/app/app.go, internal/session/session.go, internal/llm/agent/agent.go, internal/pubsub/, internal/permission/, internal/config/config.go, internal/db/)

Go-based CLI coding agent with a Bubble Tea TUI. ~Multi-provider LLM support (Anthropic, OpenAI, Google, Groq, Azure, Bedrock, VertexAI, Copilot, OpenRouter, xAI). MIT license. Project is archived on GitHub — ongoing development continues under "Crush" by the Charm team.

---

## Overview

OpenCode is a terminal-native coding assistant. Target users: individual developers wanting AI assistance in their terminal. It provides file search, editing, shell execution, LSP integration, and MCP server support. Sessions are stored in SQLite. The TUI is built on Bubble Tea (charmbracelet).

---

## Architecture

### Language & Framework
- **Language**: Go
- **TUI**: Bubble Tea (charmbracelet/bubbletea)
- **CLI**: Cobra + Viper
- **DB**: SQLite via sqlc-generated code
- **LLM SDKs**: anthropic-sdk-go, openai-go, mcp-go

### Internal Structure
```
cmd/root.go          — CLI entry point, flag parsing, mode selection
internal/app/app.go  — App struct orchestrating all services
internal/session/     — Session CRUD + pubsub broker
internal/message/     — Message persistence + pubsub
internal/llm/agent/   — Agent execution loop, tool dispatch
internal/llm/provider/ — LLM provider implementations
internal/llm/tools/   — Tool implementations (bash, edit, glob, grep, etc.)
internal/pubsub/      — Generic pub/sub broker (Go generics)
internal/permission/   — Permission request/grant system
internal/tui/         — Bubble Tea UI components
internal/config/      — Configuration loading (Viper)
internal/db/          — SQLite connection + sqlc queries
```

### Event System (internal/pubsub)
Generic `Broker[T]` with three event types: `created`, `updated`, `deleted`. Each service (session, message, permission, agent) has its own broker. Subscribers get a buffered channel. Events are non-blocking (dropped if channel full). **This is in-process only — no external event bus or webhook system.**

### Agent Execution Flow
1. `agent.Run(ctx, sessionID, content)` persists user message, calls LLM provider
2. LLM streams response; tool calls are dispatched sequentially
3. Tool results fed back to LLM in a loop until completion
4. `AgentEvent` published per response/error/summary
5. `agent.Cancel(sessionID)` cancels via stored context cancel func
6. `agent.IsSessionBusy(sessionID)` / `agent.IsBusy()` check running state

### Database Schema
- **sessions**: id, parent_session_id, title, message_count, prompt_tokens, completion_tokens, cost, summary_message_id, timestamps
- **messages**: id, session_id, role, parts (JSON), model, timestamps, finished_at
- **files**: id, session_id, path, content, version, timestamps
- Cascade deletes from sessions. Triggers maintain message_count.

### Data Storage
- Default data directory: `.opencode/` in project root (configurable via `data.directory`)
- SQLite file: `<data_dir>/opencode.db`

---

## 1. How to Spawn/Launch

### Interactive TUI Mode
```bash
opencode                          # Launch TUI
opencode -c /path/to/project     # Set working directory
opencode -d                       # Debug logging
```

### Non-Interactive (Headless) Mode
```bash
opencode -p "your prompt"                  # Single prompt, text output, exit
opencode -p "your prompt" -f json          # JSON output
opencode -p "your prompt" -q               # Suppress spinner
opencode -p "your prompt" -c /path -q -f json  # Full headless combo
```

Non-interactive flow (`RunNonInteractive`):
1. Creates a session titled with first 100 chars of prompt
2. Calls `AutoApproveSession(sessionID)` — all tool permissions auto-granted
3. Runs `CoderAgent.Run()` with the prompt
4. Waits for completion via channel
5. Formats output (text or JSON) and exits

### JSON Output Structure
```json
{
  "response": "the AI's response text"
}
```

### CLI Flags
| Flag | Short | Description |
|------|-------|-------------|
| `--prompt` | `-p` | Non-interactive prompt |
| `--output-format` | `-f` | `text` (default) or `json` |
| `--quiet` | `-q` | Suppress spinner |
| `--cwd` | `-c` | Working directory |
| `--debug` | `-d` | Debug logging |
| `--version` | `-v` | Version info |

---

## 2. How to Detect State

### From Inside (in-process)
- `agent.IsSessionBusy(sessionID) bool` — checks if a session has an active run
- `agent.IsBusy() bool` — checks if any session is active
- Pub/sub events: subscribe to `AgentEvent`, `Session`, `Message`, `Permission` brokers
- AgentEvent types: response, error, summarization status

### From Outside (external tool)
**There is no external API, HTTP server, WebSocket, Unix socket, or IPC mechanism.** External detection options:

1. **Process detection**: Check if `opencode` process is running (`ps`, `/proc`)
2. **SQLite polling**: Read `opencode.db` directly to check session state, message count, timestamps. The schema is simple and stable (sqlc-generated).
3. **PTY output parsing**: If spawned via PTY, parse the Bubble Tea TUI output (fragile)
4. **Non-interactive exit code**: In `-p` mode, the process exits after completion. Exit code indicates success/failure.

### No Hooks or Notifications
No webhook, callback, or notification system exists. No `--on-complete` flag. No event streaming to external consumers.

---

## 3. How to Send Messages / Control It

### From Inside (in-process)
- `agent.Run(ctx, sessionID, content, attachments...)` — send a new message
- `agent.Cancel(sessionID)` — cancel current operation
- `agent.Summarize(ctx, sessionID)` — trigger summarization
- `permission.Grant/Deny/GrantPersistant` — respond to permission requests

### From Outside (external tool)
**No external control mechanism exists.** Options for a dashboard:

1. **Non-interactive mode only**: Spawn `opencode -p "prompt"` per task. Each invocation is a single prompt-response cycle. No follow-up messages possible.
2. **PTY + stdin**: Spawn the TUI via PTY and write keystrokes to stdin. This is the only way to send follow-up messages, but it requires emulating the TUI's keyboard protocol (fragile).
3. **Process signals**: `SIGINT` / `SIGTERM` to stop. `Ctrl+X` (0x18) via PTY to cancel current operation.
4. **No pause/resume**: Not supported at any level.

---

## 4. PTY / Terminal Behavior

### TUI Mode (default)
- Full Bubble Tea TUI: multi-panel layout with chat, sidebar, editor
- Requires a terminal (PTY) for rendering
- Keyboard-driven: vim-like navigation, modal dialogs
- `Ctrl+E` opens external editor; inline editor with `Ctrl+S` to send
- Permission dialogs appear inline: `a` (allow), `A` (allow all), `d` (deny)

### Non-Interactive Mode (`-p`)
- No TUI rendered
- Spinner animation on stderr (suppressible with `-q`)
- Final response on stdout (text or JSON)
- All permissions auto-approved
- Process exits after completion

### Output Characteristics
- TUI mode: ANSI escape sequences, Bubble Tea rendering (full screen, alternate buffer)
- Non-interactive: clean text or JSON on stdout, spinner on stderr

---

## 5. Configuration

### Config File Locations (searched in order)
1. `$HOME/.opencode.json`
2. `$XDG_CONFIG_HOME/opencode/.opencode.json`
3. `./.opencode.json` (project-local, merged with global)

### Environment Variable Override
All config keys available with `OPENCODE_` prefix.

### Config Structure
```json
{
  "data": { "directory": ".opencode" },
  "providers": {
    "anthropic": { "apiKey": "...", "disabled": false },
    "openai": { "apiKey": "..." },
    "groq": { "apiKey": "..." }
  },
  "agents": {
    "coder": { "model": "claude-4-sonnet", "maxTokens": 5000 },
    "task": { "model": "claude-4-sonnet", "maxTokens": 5000 },
    "title": { "model": "claude-4-sonnet", "maxTokens": 80 },
    "summarizer": { "model": "...", "maxTokens": ... }
  },
  "shell": { "path": "/bin/bash", "args": ["-l"] },
  "mcpServers": {},
  "lsp": {},
  "contextPaths": [],
  "tui": {},
  "debug": false,
  "debugLSP": false,
  "autoCompact": true
}
```

### Custom Commands
Markdown files in:
- `$XDG_CONFIG_HOME/opencode/commands/` (prefixed `user:`)
- `<PROJECT_DIR>/.opencode/commands/` (prefixed `project:`)

Commands support `$ARGUMENT_NAME` placeholders.

### Data Storage
- SQLite database: `<data_dir>/opencode.db`
- File snapshots stored in `files` table per session
- Default data dir: `.opencode/` in project root

---

## 6. Model Support

### Providers & Environment Variables

| Provider | Env Var | Notable Models |
|----------|---------|----------------|
| Anthropic | `ANTHROPIC_API_KEY` | Claude 4 Sonnet/Opus, Claude 3.5/3.7 Sonnet/Haiku |
| OpenAI | `OPENAI_API_KEY` | GPT-4.1, GPT-4.5, GPT-4o, O1/O3/O4 |
| Google Gemini | `GEMINI_API_KEY` | Gemini 2.5, 2.5 Flash, 2.0 Flash |
| GitHub Copilot | `GITHUB_TOKEN` | All major models via Copilot proxy |
| Groq | `GROQ_API_KEY` | Llama 4, Deepseek R1, QWEN QWQ-32b |
| OpenRouter | (via config) | Various models |
| xAI | (via config) | Grok models |
| Azure OpenAI | `AZURE_OPENAI_ENDPOINT` + key | GPT-4.1/4.5, O1/O3/O4 |
| AWS Bedrock | `AWS_ACCESS_KEY_ID` + secret + region | Claude 3.7 Sonnet |
| Google VertexAI | `VERTEXAI_PROJECT` + location | Gemini 2.5 |
| Local/Self-hosted | `LOCAL_ENDPOINT` | Any OpenAI-compatible API |

### Agent Types
- **coder**: Main agent with full tool access (bash, edit, write, patch, glob, grep, ls, view, fetch, sourcegraph, agent, diagnostics, MCP tools)
- **task**: Sub-agent for delegated read-only tasks (glob, grep, ls, sourcegraph, view only)
- **title**: Generates session titles (low token limit)
- **summarizer**: Compresses conversation history at 95% context window usage

---

## Well-Regarded Features

### 1. Multi-Provider Support
Widest provider coverage among CLI coding agents. Automatic fallback logic based on available API keys. Easy model switching via `Ctrl+O`.

### 2. MCP Server Integration
First-class MCP support for extending tool capabilities. Configured in the same JSON config file.

### 3. LSP Integration
Language-aware diagnostics fed to the agent. Enables more accurate code modifications.

### 4. Auto-Compact
Automatic conversation summarization at 95% context window. Prevents context overflow errors.

---

## Poorly-Regarded Features / Pain Points

### 1. No External API or IPC
No way for external tools to programmatically interact with a running session. The pubsub system is entirely in-process.

### 2. Non-Interactive Mode is Single-Shot
`-p` mode creates a session, runs one prompt, and exits. No way to continue a conversation or send follow-up messages.

### 3. Archived Project
The main repository is archived. Development continues under a different name (Crush) by Charm.

---

## Learnings for banto

### What Users Actually Want
- Multi-provider model switching is table stakes for power users
- Auto-compact (context management) is a must-have for long sessions
- Permission system with "allow all for session" is the right UX for automation

### Technical Design Lessons
- **In-process pubsub is insufficient for external orchestration.** OpenCode's `Broker[T]` is clean but inaccessible from outside. banto needs an external event interface (WebSocket, SSE, or similar) from day one.
- **Non-interactive mode must support multi-turn.** Single-shot `-p` mode is limiting. A session-based API (create session, send message, read events) is far more useful for dashboards.
- **SQLite as state store works well.** OpenCode's schema is simple and effective. Direct DB polling is a viable (if hacky) external integration path.
- **Permission auto-approve per session** is the right model for automated/dashboard-driven execution.

### UX Pattern Lessons
- Bubble Tea TUI is polished but impossible to control externally. For banto's use case (dashboard + terminal), the agent should expose a programmatic interface, not just a TUI.
- Custom commands via markdown files is a nice pattern for user-defined workflows.

### Business & Ecosystem Lessons
- Project was archived and forked by its own team (Charm). This suggests the CLI coding agent space is still volatile and consolidating.
- MCP integration is becoming standard. banto should plan for MCP tool support.

---

## Sources

- https://github.com/opencode-ai/opencode — Main repository (archived)
- https://github.com/opencode-ai/opencode/blob/main/README.md — Documentation
- https://github.com/opencode-ai/opencode/blob/main/cmd/root.go — CLI entry point
- https://github.com/opencode-ai/opencode/blob/main/internal/app/app.go — App orchestration
- https://github.com/opencode-ai/opencode/blob/main/internal/llm/agent/agent.go — Agent execution
- https://github.com/opencode-ai/opencode/blob/main/internal/pubsub/broker.go — Event system
- https://github.com/opencode-ai/opencode/blob/main/internal/session/session.go — Session management
- https://github.com/opencode-ai/opencode/blob/main/internal/permission/permission.go — Permission system
- https://github.com/opencode-ai/opencode/blob/main/internal/config/config.go — Configuration
- https://github.com/opencode-ai/opencode/blob/main/internal/db/connect.go — Database connection
- https://github.com/opencode-ai/opencode/blob/main/internal/db/migrations/20250424200609_initial.sql — Schema
