# PoC: Claude Code Hooks

## Hypothesis

banto can integrate with Claude Code programmatically using:
- `--print` mode with hooks for lifecycle events (session start, tool use, stop)
- HTTP hooks to receive real-time events at a banto-controlled endpoint
- `PermissionRequest` hooks to intercept and respond to permission dialogs
- `--resume` to resume sessions by ID
- `--session-id` to assign deterministic session IDs
- `stream-json` output format for real-time streaming

The original assumptions (A1-A8) were based on an earlier understanding that used `--hook-config` CLI flag and `--permission-prompt-tool` MCP. This PoC validates the **actual** mechanism.

## Environment

- Claude Code: 2.1.70
- OS: NixOS (Linux 6.18.12)
- Runtime: Bun
- Date: 2026-03-07

## Procedure

### 1. CLI flag discovery

```bash
claude --help
```

Key findings:
- **No `--hook-config` flag exists.** Hooks are configured via `settings.json`, not CLI flags.
- **No `--permission-prompt-tool` flag exists.** Permission is handled via `PermissionRequest` hooks or `PreToolUse` hooks with `permissionDecision`.
- `--settings <file-or-json>` loads additional settings (including hooks) per invocation.
- `--permission-mode` accepts: `acceptEdits`, `bypassPermissions`, `default`, `dontAsk`, `plan`.
- `--resume <session-id>` resumes a session.
- `--session-id <uuid>` sets a specific session ID.
- `--output-format stream-json` requires `--verbose`.

### 2. Hook system architecture (from official docs)

Hooks are configured in `settings.json` (user, project, or local scope). Four hook handler types:

| Type | Mechanism | Use case |
|------|-----------|----------|
| `command` | Shell command, stdin/stdout JSON | Scripts, local processing |
| `http` | HTTP POST to URL, JSON body/response | **banto integration** |
| `prompt` | Single-turn LLM evaluation | Automated review |
| `agent` | Subagent with tool access | Complex validation |

**HTTP hooks** send the event JSON as POST body with `Content-Type: application/json`. Response uses same JSON format as command hooks. Non-2xx responses are non-blocking errors (execution continues).

Available hook events (17 total):

| Event | Fires | Can block? |
|-------|-------|-----------|
| `SessionStart` | Session begins/resumes | No |
| `UserPromptSubmit` | Before prompt processing | Yes |
| `PreToolUse` | Before tool execution | Yes (allow/deny/ask) |
| `PermissionRequest` | Permission dialog shown | Yes (allow/deny) |
| `PostToolUse` | After tool succeeds | No (feedback only) |
| `PostToolUseFailure` | After tool fails | No (feedback only) |
| `Notification` | Notification sent | No |
| `SubagentStart` | Subagent spawned | No |
| `SubagentStop` | Subagent finished | Yes |
| `Stop` | Claude finishes responding | Yes (continue) |
| `TeammateIdle` | Teammate about to idle | Yes |
| `TaskCompleted` | Task marked completed | Yes |
| `InstructionsLoaded` | CLAUDE.md loaded | No |
| `ConfigChange` | Config file changes | Yes |
| `WorktreeCreate` | Worktree creation | Yes |
| `WorktreeRemove` | Worktree removal | No |
| `PreCompact` | Before context compaction | No |
| `SessionEnd` | Session terminates | No |

### 3. HTTP hook capture server

A Bun HTTP server on port 19876 captured all hook events. Settings were passed via `--settings /tmp/banto-poc-settings.json`.

### 4. Live test: simple prompt (no tools)

```bash
CLAUDECODE= claude -p "Reply with only the number 4" \
  --settings /tmp/banto-poc-settings.json \
  --output-format json \
  --dangerously-skip-permissions \
  --no-session-persistence \
  --tools ""
```

**Events captured:** `Stop`, `SessionEnd`
**Note:** `SessionStart` HTTP hook did NOT fire (SessionStart only supports `type: "command"` per docs).

### 5. Live test: with tool use

```bash
CLAUDECODE= claude -p "Run this bash command: echo hello" \
  --settings /tmp/banto-poc-settings.json \
  --output-format json \
  --dangerously-skip-permissions \
  --no-session-persistence \
  --allowedTools "Bash"
```

**Events captured (in order):**
1. `PreToolUse` (ToolSearch) - tool_name, tool_input, tool_use_id
2. `PostToolUse` (ToolSearch) - tool_name, tool_input, tool_response, tool_use_id
3. `PreToolUse` (Bash) - tool_name, tool_input, tool_use_id
4. `PostToolUse` (Bash) - tool_name, tool_input, tool_response, tool_use_id
5. `Stop` - stop_hook_active, last_assistant_message
6. `SessionEnd` - reason

### 6. Live test: --resume

```bash
# First run (with persistence)
CLAUDECODE= claude -p "Reply with only: BANTO_TEST_OK" --output-format json ...
# session_id: 90957cbf-2a89-4476-8d40-c691899a5d05

# Resume
CLAUDECODE= claude -p "What did I ask you to reply with?" \
  --resume "90957cbf-2a89-4476-8d40-c691899a5d05" --output-format json ...
# Result: "You asked me to reply with: `BANTO_TEST_OK`"
```

**Confirmed:** `--resume` accepts session ID and resumes prior context. Same session_id is returned.

### 7. Live test: --session-id

```bash
CLAUDECODE= claude -p "Reply: OK" \
  --session-id "11111111-2222-3333-4444-555555555555" --output-format json ...
# Result session_id: "11111111-2222-3333-4444-555555555555"
```

**Confirmed:** `--session-id` sets the session ID deterministically. Must be valid UUID format.

### 8. Live test: stream-json format

```bash
CLAUDECODE= claude -p "Reply: STREAM_TEST" --output-format stream-json --verbose ...
```

**Event types in stream-json output:**
1. `{"type":"system","subtype":"init", ...}` - session_id, cwd, tools[], model, permissionMode, mcp_servers[], plugins[], etc.
2. `{"type":"assistant","message":{...}, ...}` - full Anthropic API message object with usage
3. `{"type":"rate_limit_event", ...}` - rate limit status
4. `{"type":"result","subtype":"success", ...}` - final result with total_cost_usd, usage, session_id

### 9. Live test: env var inheritance

```bash
TERM=xterm-256color COLORTERM=truecolor claude -p "Run: env | grep TERM" ...
```

**Confirmed:** TERM=xterm-256color and COLORTERM=truecolor were visible inside Bash tool execution.

## Raw Results

### Common hook input fields (all events)

```json
{
  "session_id": "95a0ffa0-47f2-476e-8518-f5935d2bf258",
  "transcript_path": "/home/user/.claude/projects/-tmp/95a0ffa0....jsonl",
  "cwd": "/tmp",
  "permission_mode": "bypassPermissions",
  "hook_event_name": "PreToolUse"
}
```

### PreToolUse payload

```json
{
  "session_id": "...",
  "transcript_path": "...",
  "cwd": "/tmp",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "echo hello",
    "description": "Print hello"
  },
  "tool_use_id": "toolu_01Bar4tBs3nt4WrWKwyoqmpS"
}
```

### PostToolUse payload

```json
{
  "session_id": "...",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "echo hello",
    "description": "Print hello"
  },
  "tool_response": {
    "stdout": "hello",
    "stderr": "",
    "interrupted": false,
    "isImage": false,
    "noOutputExpected": false
  },
  "tool_use_id": "toolu_01Bar4tBs3nt4WrWKwyoqmpS"
}
```

### Stop payload

```json
{
  "session_id": "...",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "Done. The command printed `hello` as expected."
}
```

### SessionEnd payload

```json
{
  "session_id": "...",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

### JSON output format

```json
{
  "type": "result",
  "subtype": "success",
  "session_id": "...",
  "total_cost_usd": 0.098998,
  "usage": {
    "input_tokens": 7,
    "cache_creation_input_tokens": 13326,
    "cache_read_input_tokens": 23251,
    "output_tokens": 162
  },
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 7,
      "outputTokens": 162,
      "cacheReadInputTokens": 23251,
      "cacheCreationInputTokens": 13326,
      "costUSD": 0.098998,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    }
  }
}
```

### stream-json init event

```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/tmp",
  "session_id": "...",
  "tools": ["mcp__pencil__batch_design", ...],
  "mcp_servers": [{"name":"pencil","status":"connected"}, ...],
  "model": "claude-opus-4-6",
  "permissionMode": "bypassPermissions",
  "claude_code_version": "2.1.70"
}
```

### HTTP hook metadata

- HTTP client: `axios/1.8.4`
- Content-Type: `application/json`
- Method: POST
- Response format: same JSON as command hooks (exit code 0 + stdout)

## Assumption Validation

| ID | Assumption | Result | Notes |
|----|-----------|--------|-------|
| A1 | CC accepts `--print` with `--hook-config` JSON parameter for HTTP callbacks | **falsified** | `--hook-config` does not exist. Use `--settings` to pass hook config as JSON/file. HTTP hooks use `type: "http"` in settings, not a CLI flag. The **intent** (hooks + print mode) works, but the **mechanism** is different. |
| A2 | CC HTTP hooks emit Notification events containing session_id and context_window info | **partial** | All hook events include `session_id`. However, `context_window` is NOT in hook payloads. Context info is only in `stream-json` output (`modelUsage.contextWindow`). Notification events include `message`, `title`, `notification_type` but no context metrics. |
| A3 | CC hooks provide Pre/PostToolUse events with tool_name and tool_input fields | **verified** | Both `PreToolUse` and `PostToolUse` fire with `tool_name`, `tool_input`, `tool_use_id`. PostToolUse also includes `tool_response`. Confirmed via live HTTP hook capture. |
| A4 | CC MCP `permission_prompt` tool callback returns `{ approved: boolean }` synchronously | **falsified** | No `--permission-prompt-tool` MCP exists. Permission is handled via two mechanisms: (1) `PreToolUse` hook returning `permissionDecision: "allow"/"deny"/"ask"`, or (2) `PermissionRequest` hook returning `decision.behavior: "allow"/"deny"`. Both are synchronous HTTP responses. The interface differs completely from assumption. |
| A5 | CC `--resume` flag accepts a session ID and resumes prior context | **verified** | `--resume <uuid>` works. Returns same session_id. Requires session persistence (fails with `--no-session-persistence`). |
| A6 | CC Notification hook includes idle/tool_use event types with documented payload structure | **partial** | Notification hook fires for: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`. No "tool_use" notification type. Payload has `message`, `title`, `notification_type`. Not a general event bus - separate PreToolUse/PostToolUse hooks exist for tool lifecycle. |
| A7 | Hook HTTP endpoint port is accessible from CC subprocess (localhost) | **verified** | HTTP hooks on localhost:19876 received all events correctly. CC uses axios internally. Response latency was <10ms. |
| A8 | CC process environment variables (TERM, COLORTERM) are correctly inherited | **verified** | TERM=xterm-256color and COLORTERM=truecolor set on the parent process were visible inside CC Bash tool execution. |

## Conclusions

### Architecture impact on banto

1. **Hook delivery mechanism is different from assumed.** No `--hook-config` CLI flag. Instead, banto must:
   - Generate a `settings.json` (or pass `--settings` with inline JSON) per session
   - Use `type: "http"` hooks pointing to banto's HTTP endpoint
   - This is functionally equivalent but changes the spawning code

2. **Permission management works differently.** Two approaches available:
   - **`PreToolUse` hook** with `permissionDecision: "allow"/"deny"/"ask"` - fires BEFORE permission check, can pre-emptively allow/deny
   - **`PermissionRequest` hook** with `decision.behavior: "allow"/"deny"` - fires WHEN permission dialog would appear
   - banto should use **both**: `PreToolUse` for auto-approve rules, `PermissionRequest` as fallback for user-facing permission prompts

3. **Context window tracking requires stream-json**, not hooks. The `modelUsage.contextWindow` and token counts are in the result JSON, not hook payloads. banto must parse `stream-json` output for context metrics.

4. **SessionStart does NOT support HTTP hooks** (command-only per docs). banto should use the `system.init` event from `stream-json` output for session initialization tracking.

5. **`--session-id`** allows banto to assign its own UUIDs, avoiding the need to parse session_id from output before recording events.

6. **`--settings`** can pass hook configuration per-invocation, so banto doesn't need to modify global or project settings files.

### Recommended CC spawn command for banto

```bash
claude -p "<prompt>" \
  --session-id "<banto-generated-uuid>" \
  --settings '{"hooks":{"PreToolUse":[{"hooks":[{"type":"http","url":"http://localhost:<port>/hooks/pre-tool-use"}]}],"PostToolUse":[{"hooks":[{"type":"http","url":"http://localhost:<port>/hooks/post-tool-use"}]}],"PermissionRequest":[{"hooks":[{"type":"http","url":"http://localhost:<port>/hooks/permission-request"}]}],"Stop":[{"hooks":[{"type":"http","url":"http://localhost:<port>/hooks/stop"}]}],"SessionEnd":[{"hooks":[{"type":"http","url":"http://localhost:<port>/hooks/session-end"}]}],"Notification":[{"hooks":[{"type":"http","url":"http://localhost:<port>/hooks/notification"}]}]}}' \
  --output-format stream-json \
  --verbose \
  --permission-mode default
```

For resume: add `--resume "<session-id>"` instead of a new prompt.

## Open Questions

1. **PermissionRequest in -p mode**: In our tests, PermissionRequest never fired because either `--dangerously-skip-permissions` was used or tools were pre-allowed. Need to test with a prompt that triggers a genuinely unpermitted tool use (e.g., file write without allowedTools) to see if PermissionRequest fires and blocks until the HTTP hook responds.

2. **SessionStart HTTP hook**: Docs say SessionStart only supports `type: "command"`. Need to verify if this is enforced or just undocumented HTTP support. The `system.init` event from stream-json is an adequate alternative.

3. **Concurrent sessions**: How many simultaneous CC instances can run? Each has its own session_id, but they share the same `~/.claude/` state directory. Need to test under load.

4. **Hook timeout behavior**: When an HTTP hook times out (default 30s for HTTP), does CC block the tool call or proceed? Docs say non-2xx/timeout = "non-blocking error, execution continues." This means a slow banto server would NOT block tool execution - need to consider implications for permission management.

5. **`--input-format stream-json`**: Supports streaming input for multi-turn conversations without spawning multiple processes. Not tested in this PoC but could simplify banto's session management (single long-lived process per session instead of spawn-per-prompt).

6. **PreCompact hook**: Fires before context compaction. banto could use this to track when context is being compressed, which affects the context_window percentage metric.

7. **`context_window` in modelUsage**: The stream-json `result` event includes `contextWindow: 200000` in `modelUsage`. But token usage (input + output + cache) would need to be calculated client-side as a percentage. No "context % used" field exists.
