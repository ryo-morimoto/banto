# Claude Code External Integration Points for Orchestration

Research date: 2026-03-07

## 1. Hooks System

### Available Hook Events (17 total)

| Event | When | Can Block? | Matcher Field |
|-------|------|-----------|---------------|
| `SessionStart` | Session begins/resumes | No | source: `startup`, `resume`, `clear`, `compact` |
| `UserPromptSubmit` | User submits prompt | Yes | No matcher (always fires) |
| `PreToolUse` | Before tool executes | Yes | tool name |
| `PermissionRequest` | Permission dialog shown | Yes | tool name |
| `PostToolUse` | After tool succeeds | No (feedback only) | tool name |
| `PostToolUseFailure` | After tool fails | No | tool name |
| `Notification` | Claude needs attention | No | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog` |
| `SubagentStart` | Subagent spawned | No | agent type |
| `SubagentStop` | Subagent finishes | Yes | agent type |
| `Stop` | Claude finishes responding | Yes (continues) | No matcher |
| `TeammateIdle` | Teammate about to idle | Yes | No matcher |
| `TaskCompleted` | Task marked complete | Yes | No matcher |
| `InstructionsLoaded` | CLAUDE.md loaded | No | No matcher |
| `ConfigChange` | Config file changes | Yes | config source |
| `WorktreeCreate` | Worktree being created | Yes | No matcher |
| `WorktreeRemove` | Worktree being removed | No | No matcher |
| `PreCompact` | Before compaction | No | `manual`, `auto` |
| `SessionEnd` | Session terminates | No | `clear`, `logout`, `prompt_input_exit`, etc. |

### Hook Types

1. **Command** (`type: "command"`): Shell command. Receives JSON on stdin. Default timeout 600s.
2. **HTTP** (`type: "http"`): POST to URL. Same JSON as body. Non-2xx = non-blocking error.
3. **Prompt** (`type: "prompt"`): Single-turn LLM evaluation. Returns `{ok, reason}`.
4. **Agent** (`type: "agent"`): Multi-turn subagent with tool access. Same return format.

### Configuration

Settings JSON files at:
- `~/.claude/settings.json` (user-global)
- `.claude/settings.json` (project, committable)
- `.claude/settings.local.json` (project, gitignored)
- Managed policy settings (org-wide)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### Common Input Fields (stdin JSON)

All events receive:
- `session_id` - Current session ID
- `transcript_path` - Path to conversation JSONL file
- `cwd` - Working directory
- `permission_mode` - Current mode
- `hook_event_name` - Which event fired
- `agent_id` / `agent_type` - When inside subagent

### Exit Code Semantics

- **Exit 0**: Proceed. Stdout parsed as JSON (if valid) or added as context.
- **Exit 2**: Block. Stderr fed back to Claude as error.
- **Other**: Non-blocking error. Stderr logged in verbose mode only.

### Key Hooks for Orchestration

- **`Notification`** with matcher `idle_prompt`: Fires when Claude is done and waiting. **This is the primary "task complete" signal.**
- **`Notification`** with matcher `permission_prompt`: Fires when Claude needs permission approval.
- **`Stop`**: Fires when Claude finishes responding. Can force continuation via exit 2.
- **`SessionStart`**: Inject context at session start (stdout added to context).
- **`PostToolUse`**: Observe every tool execution after the fact.
- **HTTP hooks**: POST event data to an external server. Perfect for a dashboard.

## 2. Non-Interactive Mode (`-p` / `--print`)

### Basic Usage

```bash
claude -p "prompt text"                    # Run and exit
cat file | claude -p "analyze this"        # Pipe input
claude -p "continue" --continue            # Continue last session
claude -p "next" --resume <session-id>     # Resume specific session
```

### Output Formats

| Format | Flag | Description |
|--------|------|-------------|
| text | `--output-format text` | Plain text (default) |
| json | `--output-format json` | JSON with `result`, `session_id`, metadata |
| stream-json | `--output-format stream-json` | Newline-delimited JSON events in real-time |

### Stream-JSON Events

With `--output-format stream-json --verbose --include-partial-messages`:
- Each line is a JSON object with a `type` field
- Filter for `type == "stream_event"` with `event.delta.type == "text_delta"` for streaming text
- Each event is valid JSON; the full output is NOT valid JSON if concatenated

### Structured Output

```bash
claude -p "query" --output-format json --json-schema '{"type":"object","properties":{"name":{"type":"string"}}}'
```
Returns metadata + `structured_output` field conforming to schema.

### Key Flags for Headless Mode

- `--max-turns N`: Limit agentic turns. Exits with error when reached.
- `--max-budget-usd N`: Dollar cap on API calls.
- `--allowedTools "Bash,Read,Edit"`: Auto-approve specific tools.
- `--dangerously-skip-permissions`: Skip all permission prompts (sandbox only).
- `--permission-mode plan`: Read-only analysis mode.
- `--permission-prompt-tool mcp_tool`: Delegate permission decisions to an MCP tool.
- `--no-session-persistence`: Don't save session to disk.
- `--fallback-model sonnet`: Auto-fallback on overload.

### Input Format

- `--input-format text` (default): Prompt as positional arg or stdin
- `--input-format stream-json`: Real-time streaming input (bidirectional with `--output-format stream-json`)

## 3. State Detection

### From Hooks (Recommended)

| State | Detection Method |
|-------|-----------------|
| Running | `PostToolUse` / `PreToolUse` hooks fire = actively working |
| Waiting for permission | `Notification` with `permission_prompt` matcher |
| Waiting for input | `Notification` with `idle_prompt` matcher |
| Done responding | `Stop` hook fires |
| Session ended | `SessionEnd` hook fires |
| Task completed | `TaskCompleted` hook fires |

### From Process (Headless Mode)

- Process running = Claude working
- Process exited = Done
- `--output-format stream-json`: Real-time events show current activity
- `--output-format json`: Parse exit JSON for `session_id`, `result`, cost info

### Transcript File

The `transcript_path` field in hook input points to a JSONL file with the full conversation history. An external tool can tail this file for real-time state.

### No Explicit Exit Codes Documented

The docs do not specify numeric exit codes for success/failure/timeout. The process exit code behavior is:
- Normal completion: likely 0
- `--max-turns` exceeded: exits with error
- General approach: Use `--output-format json` and check the `result` field

## 4. Message Sending / IPC

### No Direct IPC API

There is **no documented API** to send messages to a running interactive Claude Code session. No Unix socket, no HTTP API, no named pipe.

### Workarounds

1. **`--input-format stream-json`** with **`--output-format stream-json`**: Bidirectional streaming via stdin/stdout in `-p` mode. This is the closest thing to an IPC channel.

2. **`--continue` / `--resume`**: Send follow-up messages to a session by spawning a new `claude -p --continue "message"` process. Not real-time, but works for sequential orchestration.

3. **`--permission-prompt-tool`**: Delegate permission decisions to an MCP tool in headless mode. The MCP tool receives the permission request and can approve/deny programmatically.

4. **Hooks + HTTP**: Set up HTTP hooks that POST events to your orchestration server. The server can observe state but cannot send messages back into the session.

## 5. Session Management

### Session ID

```bash
claude --session-id "550e8400-e29b-41d4-a716-446655440000"  # Use specific UUID
```

### Resume / Continue

```bash
claude --continue                    # Most recent session in current dir
claude --continue -p "next task"     # Continue in headless mode
claude --resume <session-id>         # Resume by ID
claude --resume auth-refactor        # Resume by name
claude --from-pr 123                 # Resume session linked to PR
```

### Fork

```bash
claude --resume <id> --fork-session  # Create new session branching from existing
```

### Session Persistence

- Sessions stored per project directory
- `/rename <name>` to name a session
- `--no-session-persistence`: Disable saving (headless only)
- Capture session ID from JSON output: `jq -r '.session_id'`

### Worktrees for Parallel Sessions

```bash
claude --worktree feature-auth       # Isolated git worktree + session
claude --worktree                    # Auto-generated name
```

Creates `.claude/worktrees/<name>/` with separate branch. Auto-cleanup on exit if no changes.

## 6. MCP Integration

### Registering as MCP Server for Claude Code

External tools can register as MCP servers that Claude Code connects to:

```bash
# HTTP (recommended)
claude mcp add --transport http my-dashboard https://localhost:8080/mcp

# SSE
claude mcp add --transport sse my-dashboard https://localhost:8080/sse

# stdio
claude mcp add my-tool -- /path/to/binary --args
```

### Scopes

- **local** (default): Private to you, current project. Stored in `~/.claude.json`.
- **project**: Shared via `.mcp.json` in project root. Committable.
- **user**: Available across all projects. Stored in `~/.claude.json`.

### CLI Config via `--mcp-config`

```bash
claude --mcp-config ./mcp.json               # Load from file
claude --strict-mcp-config --mcp-config ./mcp.json  # ONLY these servers
```

### Claude Code AS an MCP Server

```bash
claude mcp serve  # Start Claude Code as stdio MCP server
```

Exposes Claude's built-in tools (Read, Edit, Bash, etc.) to any MCP client.

### Dynamic Tool Updates

Claude Code supports MCP `list_changed` notifications, so your MCP server can add/remove tools at runtime without reconnection.

### MCP Tool Search

When many MCP tools are configured, Claude Code defers loading them and uses a search tool to find relevant ones on demand. Configurable via `ENABLE_TOOL_SEARCH=auto|true|false`.

### Permission Prompt Tool

```bash
claude -p --permission-prompt-tool mcp__my_server__approve "task"
```

Delegates permission decisions to an MCP tool. The tool receives the permission request and returns allow/deny. This enables fully programmatic control in headless mode.

## 7. Exit Codes and Output Format

### Output Formats

**`--output-format text`** (default):
- Plain text response only

**`--output-format json`**:
- Returns JSON with: `result` (text), `session_id`, usage metadata, cost, duration
- With `--json-schema`: adds `structured_output` field validated against schema

**`--output-format stream-json`**:
- Newline-delimited JSON objects, each with a `type` field
- Real-time streaming of events as they happen
- With `--include-partial-messages`: token-level streaming

### Exit Codes

Not explicitly documented. Observed behavior:
- `--max-turns` exceeded: Error exit
- Normal completion: Standard exit
- Best practice: Use `--output-format json` and inspect the response

## Summary: What's Available for banto

### Best Integration Pattern

1. **Spawn sessions** with `claude -p --output-format stream-json --session-id <uuid>` for headless tasks
2. **Observe state** via HTTP hooks (`Notification`, `Stop`, `PostToolUse`, `SessionEnd`) posting to banto's API
3. **Stream output** by parsing stream-json from stdout for real-time terminal display
4. **Send follow-up messages** with `claude -p --continue --session-id <uuid> "message"`
5. **Register banto as MCP server** to give Claude access to task management tools
6. **Permission handling** via `--permission-prompt-tool` pointing to a banto MCP tool, or `--dangerously-skip-permissions` in sandboxed environments

### Key Limitations

- No way to inject messages into a running interactive TUI session
- No WebSocket/HTTP API on the Claude Code process itself
- Stream-json bidirectional mode (`--input-format stream-json`) is the closest to real-time IPC
- `PermissionRequest` hooks do NOT fire in headless mode (`-p`); use `PreToolUse` instead
- Exit codes are not formally documented
