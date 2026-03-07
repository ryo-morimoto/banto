# Codex Orchestrator (kingbootoshi/codex-orchestrator) Research

Date: 2026-03-07
Sources:
- https://github.com/kingbootoshi/codex-orchestrator

CLI tool that delegates tasks to OpenAI Codex agents via tmux sessions. 215+ stars, MIT licensed, TypeScript (85.6%) + Shell (14.4%). Designed to be driven by Claude Code as the orchestrator layer.

---

## Overview

Codex Orchestrator implements a planning-execution separation: Claude Code handles strategic orchestration (task breakdown, monitoring, synthesis), while OpenAI Codex agents execute coding work in isolated tmux sessions. The user describes what they want; Claude plans and delegates via the CLI; Codex agents do the work in parallel.

Key value proposition: unblock the single-session bottleneck. Instead of waiting for one agent to finish before starting the next task, spawn multiple agents concurrently and monitor/redirect them as needed.

---

## Architecture

### Runtime & Stack

- **Runtime:** Bun
- **Terminal multiplexing:** tmux (each agent = one detached tmux session)
- **Coding agent:** OpenAI Codex CLI (`@openai/codex`)
- **Output logging:** `script` command captures terminal output to file alongside tmux

### Session Lifecycle

1. `startJob()` generates a random hex ID, writes prompt to file, creates a detached tmux session running `script -q <logFile> codex <args>`
2. Session returns immediately (fire-and-forget). Parent process gets job ID back.
3. Jobs are monitored via polling: tmux session existence checks + log file modification time for inactivity detection.
4. Completion is detected by scanning output for marker string `"codex-agent: Session complete"`.
5. On completion, full output is captured from tmux scrollback history.

**Actual session creation (`src/tmux.ts`):**

```typescript
export function createSession(options: {
  jobId: string;
  prompt: string;
  model: string;
  reasoningEffort: string;
  sandbox: string;
  cwd: string;
}): { sessionName: string; success: boolean; error?: string } {
  const sessionName = getSessionName(options.jobId);
  const logFile = `${config.jobsDir}/${options.jobId}.log`;
  const notifyHook = `${import.meta.dir}/notify-hook.ts`;

  // Create prompt file to avoid shell escaping issues
  const promptFile = `${config.jobsDir}/${options.jobId}.prompt`;
  const fs = require("fs");
  fs.writeFileSync(promptFile, options.prompt);

  // Create detached session that runs codex and stays open after it exits
  // Using script to log all terminal output
  const shellCmd = `script -q "${logFile}" codex ${codexArgs}; echo "\\n\\n[codex-agent: Session complete. Press Enter to close.]"; read`;

  execSync(
    `tmux new-session -d -s "${sessionName}" -c "${options.cwd}" '${shellCmd}'`,
    { stdio: "pipe", cwd: options.cwd }
  );

  // Skip update prompt if it appears by sending "3" (skip until next version)
  spawnSync("sleep", ["1"]);
  execSync(`tmux send-keys -t "${sessionName}" "3"`, { stdio: "pipe" });
  spawnSync("sleep", ["0.5"]);
  execSync(`tmux send-keys -t "${sessionName}" Enter`, { stdio: "pipe" });
  spawnSync("sleep", ["1"]);

  // For very long prompts, use load-buffer approach instead of send-keys
  if (options.prompt.length < 5000) {
    execSync(`tmux send-keys -t "${sessionName}" '${promptContent}'`, { stdio: "pipe" });
    spawnSync("sleep", ["0.3"]);
    execSync(`tmux send-keys -t "${sessionName}" Enter`, { stdio: "pipe" });
  } else {
    execSync(`tmux load-buffer "${promptFile}"`, { stdio: "pipe" });
    execSync(`tmux paste-buffer -t "${sessionName}"`, { stdio: "pipe" });
    spawnSync("sleep", ["0.3"]);
    execSync(`tmux send-keys -t "${sessionName}" Enter`, { stdio: "pipe" });
  }
  // ...
}
```

### Job Metadata Storage

Jobs persist as individual JSON files in `~/.codex-agent/jobs/`. Each file contains:

```json
{
  "id": "8abfab85",
  "tmuxSession": "codex-agent-8abfab85",
  "prompt": "...",
  "model": "gpt-5.4",
  "reasoningEffort": "xhigh",
  "sandbox": "workspace-write",
  "cwd": "/path/to/project",
  "status": "completed",
  "createdAt": "...",
  "startedAt": "...",
  "completedAt": "...",
  "turnCount": 3,
  "turnState": "idle",
  "lastTurnCompletedAt": "...",
  "result": "...",
  "lastAgentMessage": "..."
}
```

Design notes:
- File-per-job, not a database. Simple, but no querying capability.
- Auxiliary files per job: `.prompt`, `.log`, `.turn-complete` (signal file).
- Jobs sorted by creation date (newest first). Default display limit: 20. Auto-cleanup: 7 days.

### Source Code Organization (10 files in `src/`)

| File | Role |
|------|------|
| `cli.ts` | Command dispatch, argument parsing |
| `config.ts` | Defaults: model (gpt-5.4), sandbox (workspace-write), reasoning (xhigh), paths |
| `jobs.ts` | Job CRUD, lifecycle, structured JSON output generation |
| `tmux.ts` | Session creation, message sending, output capture, monitoring |
| `session-parser.ts` | Parse tokens, files_modified, summary from terminal logs |
| `output-cleaner.ts` | Strip ANSI, filter noise, normalize output |
| `watcher.ts` | File-based turn signaling (`.turn-complete` files) |
| `files.ts` | File system utilities |
| `notify-hook.ts` | Notification/webhook on completion |
| `config.ts` | tmux prefix: `codex-agent`, jobs dir: `~/.codex-agent/jobs`, 60min inactivity timeout |

### Commands

| Command | Purpose | Implementation |
|---------|---------|----------------|
| `start <prompt>` | Spawn new agent in tmux | Creates detached tmux session, writes prompt to file, sends to codex |
| `send <id> <msg>` | Redirect running agent mid-task | `tmux send-keys` with quote escaping + 0.3s delay before Enter |
| `capture <id> [n]` | Get last N lines (default: 50) | `tmux capture-pane` |
| `watch <id>` | Stream live output | Polling loop on `getJobOutput()` with interval refresh |
| `attach <id>` | Get tmux attach command | Returns `tmux attach -t <session>` string |
| `output <id>` | Full session transcript | `tmux capture-pane -S -` (full scrollback, 50MB limit) |
| `status <id>` | Job state + metadata | Refreshes status from tmux then displays |
| `await-turn` | Block until agent completes turn | Polls `.turn-complete` signal file |
| `jobs [--json]` | List all jobs | With `--json`: enriched metadata including tokens, files, summary |
| `kill <id>` | Terminate agent | `tmux kill-session` (documented as "last resort") |
| `clean` | Remove jobs > 7 days old | File cleanup |
| `health` | Check tmux + codex installed | Version validation |

#### Key Flags

- `-r low|medium|high|xhigh` — Reasoning effort level
- `-s read-only|workspace-write|danger-full-access` — Sandbox mode
- `-f <glob>` (repeatable) — Include specific files in agent context
- `--map` — Inject `docs/CODEBASE_MAP.md` into prompt (via companion tool "Cartographer")
- `--wait` — Block until job completes
- `--notify-on-complete <cmd>` — Run shell command on completion
- `--strip-ansi` / `--clean` — Remove terminal control codes from output
- `--json` — Structured output for `jobs` command
- `--dry-run` — Preview without execution

### Mid-Task Messaging Pattern

#### How it works

`send <id> <message>` uses `tmux send-keys` to inject text into the running agent's terminal session:

1. Verify session exists via `sessionExists()`
2. Escape single quotes in the message
3. Execute `tmux send-keys -t "<session>" '<escaped_message>'`
4. Wait 0.3 seconds
5. Send Enter keystroke

This is a terminal-level injection — the text appears as if the user typed it into the agent's stdin. It relies on the Codex CLI supporting mid-task steering (which Codex 5.3+ does natively via "steer mode").

#### Implementation (from tmux.ts)

```typescript
// Simplified from src/tmux.ts
async function sendMessage(sessionName: string, message: string): Promise<void> {
  const escaped = message.replace(/'/g, "'\\''");
  await exec(`tmux send-keys -t "${sessionName}" '${escaped}'`);
  await sleep(300); // 0.3s delay before Enter
  await exec(`tmux send-keys -t "${sessionName}" Enter`);
}

async function captureOutput(sessionName: string, lines: number = 50): Promise<string> {
  const { stdout } = await exec(
    `tmux capture-pane -t "${sessionName}" -p -S -${lines}`
  );
  return stdout;
}

async function getFullScrollback(sessionName: string): Promise<string> {
  const { stdout } = await exec(
    `tmux capture-pane -t "${sessionName}" -p -S - -E -`  // 50MB limit
  );
  return stripAnsi(stdout);
}
```

#### Strengths

- Zero-cost implementation: piggybacks on tmux's existing send-keys capability
- Works because Codex CLI has first-class mid-task input support (Enter sends immediately during running tasks)
- Enables course correction without restarting: "Stop — focus on the auth module instead"
- The orchestrating Claude can read agent output, decide a redirect is needed, and send it autonomously

#### Limitations

- No structured message protocol — it's raw text injection into a terminal
- No acknowledgment mechanism — you don't know if the agent received/processed the message
- Shell escaping issues possible with complex messages
- Relies entirely on the underlying CLI supporting mid-stream input (Codex does; Claude Code does not in the same way)
- Messages over 5000 chars require buffer loading instead of direct send-keys

### Structured Result Extraction

#### `jobs --json` Output Format

```json
{
  "generated_at": "2026-03-07T...",
  "jobs": [
    {
      "id": "8abfab85",
      "status": "completed",
      "prompt": "Review this codebase... (truncated to 100 chars)",
      "model": "gpt-5.4",
      "reasoning": "xhigh",
      "cwd": "/path/to/project",
      "elapsed_ms": 14897,
      "created_at": "...",
      "completed_at": "...",
      "tokens": {
        "input": 36581,
        "output": 282,
        "context_window": 258400,
        "context_used_pct": 14.16
      },
      "files_modified": ["src/auth.ts"],
      "summary": "Task completion summary (truncated to 500 chars)"
    }
  ]
}
```

#### How Extraction Works (session-parser.ts)

The parser operates on raw terminal log files:

1. **ANSI stripping:** Regex removal of OSC, CSI, C1, and control characters
2. **Token extraction:** Parses `total_token_usage` object from session metadata (input_tokens, output_tokens, model_context_window). Calculates context_used_pct.
3. **Files modified detection:** Finds `apply_patch` tool calls, then extracts filenames from patch headers ("Update File:", "Add File:", "Delete File:", "Move to:"). Uses Set for dedup.
4. **Summary extraction:** Supports two formats:
   - JSONL: Processes `event_msg` payloads (type `agent_message`) and `response_item` messages
   - JSON: Parses `items` array, filters for assistant role entries
5. **Output cleaning pipeline (output-cleaner.ts):**
   - Strip ANSI/control sequences
   - Filter Chrome-specific artifacts and typing artifacts (garbled text detection via word length analysis)
   - Remove noise lines (progress indicators, JSON fragments)
   - Convert bullet glyphs to markdown
   - Deduplicate consecutive lines

#### Implementation (from session-parser.ts)

```typescript
// Simplified from src/session-parser.ts
function parseTokenUsage(rawLog: string): TokenUsage | null {
  const match = rawLog.match(/total_token_usage["\s:]+\{([^}]+)\}/);
  if (!match) return null;
  const input = parseInt(match[1].match(/input_tokens["\s:]+(\d+)/)?.[1] ?? "0");
  const output = parseInt(match[1].match(/output_tokens["\s:]+(\d+)/)?.[1] ?? "0");
  const window = parseInt(match[1].match(/model_context_window["\s:]+(\d+)/)?.[1] ?? "0");
  return { input, output, context_window: window, context_used_pct: ((input + output) / window) * 100 };
}

function parseFilesModified(rawLog: string): string[] {
  const files = new Set<string>();
  const patchRegex = /(?:Update File|Add File|Delete File|Move to):\s*(.+)/g;
  let match;
  while ((match = patchRegex.exec(rawLog)) !== null) {
    files.add(match[1].trim());
  }
  return [...files];
}
```

```typescript
// Simplified from src/output-cleaner.ts
function cleanOutput(raw: string): string {
  return raw
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")   // Strip ANSI CSI
    .replace(/\x1B\][^\x07]*\x07/g, "")        // Strip OSC
    .replace(/[\x00-\x08\x0E-\x1F]/g, "")      // Strip C0 controls
    .split("\n")
    .filter(line => !isNoiseLine(line))          // Remove progress indicators, JSON fragments
    .filter((line, i, arr) => line !== arr[i-1]) // Deduplicate consecutive
    .join("\n");
}
```

#### Evaluation

The approach is clever but fragile: parsing unstructured terminal output with regex to produce structured data. It works because Codex CLI output follows predictable patterns, but any CLI output format change breaks the parser. A proper API or structured event stream would be more reliable.

---

## Well-Regarded Features

### 1. Planning-Execution Separation
Claude orchestrates, Codex executes. Each tool used for its strength. Users report this combination covers "both the orchestration and execution layers." The author's workflow: Opus plans + synthesizes, Codex agents research + implement in parallel.

### 2. Codebase Map (`--map`)
The companion "Cartographer" tool generates `docs/CODEBASE_MAP.md` (file purposes, module boundaries, data flows). Injected into every agent prompt via `--map`. The author calls this "the difference between agents that fumble around and agents that execute with precision." This eliminates the exploration overhead that wastes agent time and tokens.

### 3. Fire-and-Forget Parallel Execution
Spawn multiple agents, continue working, check results later. Users value the unblocking of flow: "once you use it, it's hard to go back."

### 4. Mid-Task Steering
Send course corrections to running agents without killing them. Combined with Codex 5.3+'s native steer mode, this enables real-time collaboration with agents.

### 5. Claude Code Plugin Integration
When installed as a plugin, Claude learns to use the CLI automatically. Users can describe requirements in natural language; Claude handles delegation, flag selection (sandbox mode, reasoning level), and result synthesis.

### 6. Practical Defaults
- `--wait` for blocking when needed
- `--notify-on-complete` for async notification
- Sandbox modes for safety (read-only for research, workspace-write for implementation)
- Reasoning levels matched to task complexity

---

## Poorly-Regarded Features / Pain Points

### 1. Platform Support — macOS Only
The `script` command syntax used for output logging is macOS-specific. Linux and Windows users cannot use the tool. Two GitHub issues filed (Feb 2026) for Linux and Windows compatibility. This is a hard blocker for adoption outside macOS.

### 2. No Structured Communication Protocol
Mid-task messaging is raw terminal text injection. No acknowledgment, no message format, no delivery guarantee. The orchestrator cannot confirm whether the agent received or acted on a redirect.

### 3. Fragile Output Parsing
Structured result extraction relies on regex parsing of terminal output. Any change in Codex CLI output format breaks token/file/summary extraction. The output-cleaner has to handle Chrome artifacts, typing artifacts, and various noise patterns — a constant maintenance burden.

### 4. File-Based Job Storage
Individual JSON files in `~/.codex-agent/jobs/` — no query capability, no indexing, no concurrent access safety. Works for a single user running a few agents, but doesn't scale to a dashboard use case.

### 5. Polling-Based Monitoring
Watch and status commands use polling (checking tmux session existence, reading log file modification time). No event-driven architecture. Turn completion is signaled via `.turn-complete` marker files on the filesystem.

### 6. No Web UI / Dashboard
CLI-only. Users must switch between terminal windows to monitor multiple agents. No visual overview of all running/completed jobs.

### 7. Tight Coupling to Codex CLI
The entire tool is purpose-built for OpenAI's Codex CLI. Cannot be used with Claude Code, Gemini, or other coding agents without significant modification.

---

## User Feedback Summary

### Author (Bootoshi) — 3+ months daily use

- Recommends MCP integrations (Exa AI code search) to boost agent accuracy
- Workflow: "converse first to verify understanding, then implement"
- Emphasizes codebase mapping as essential for agent performance
- Demonstrates parallel agent swarms: Opus sends off Codex agents to research, reads all output, synthesizes back

### Community (Medium, X, GitHub)

- Positive: "once you use it, it's hard to go back" — the parallel execution unlocks flow
- Positive: Plugin integration with Claude Code makes delegation feel natural
- Negative: Platform compatibility (Linux/Windows) blocks adoption
- Negative: No discussion found on Reddit or HN specifically about this tool (niche audience)
- Context: The broader Codex ecosystem suffers from headless mode limitations (GitHub issue #4219) — Codex CLI wasn't designed for non-interactive automation, making orchestration tools like this inherently fragile

### Comparison Point (HN)

"With Codex, the framing is an interactive collaborator: you steer it mid-execution. With Opus, the emphasis is the opposite: a more autonomous system that plans deeply and asks less of the human." — This validates the planning-execution split that codex-orchestrator implements.

---

## Learnings for banto

### What Users Actually Want

- **The Real Value is the Dashboard View:** Codex Orchestrator is a CLI that helps power users but lacks visual overview. banto's core differentiator is the dashboard: "one view, active tasks listed by project." This is exactly the gap that codex-orchestrator users feel — they want to see all agents at a glance without switching terminal windows.
- **Notification on Completion is Table Stakes:** `--notify-on-complete` is one of the most practical features. banto should have push notifications (PWA) for session state changes — this aligns with what Happy Coder users also value most.
- **Codebase Map Pattern is Valuable:** The `--map` concept (injecting architectural docs into agent prompts) significantly improves agent accuracy. banto could store codebase maps per project, auto-inject relevant context when spawning sessions, and consider auto-generating maps via a similar "Cartographer" approach.

### Technical Design Lessons

- **Structured Result Extraction: Use Agent SDK, Not Terminal Parsing:** Codex Orchestrator's regex-based parsing of terminal output is fragile and requires constant maintenance. banto's architecture should prefer Claude Agent SDK for programmatic access to agent state, tool calls, and responses; structured event streams (not terminal scraping); first-class token tracking, file modification detection, and summary extraction through the SDK. If terminal output must be parsed, define a clear contract and version it.
- **File-Per-Job Storage Won't Scale for a Dashboard:** banto already plans to use SQLite — this is correct. Codex Orchestrator's file-per-job approach lacks querying, indexing, and concurrent access. A dashboard needs fast queries across all jobs (filtering by project, status, date range), concurrent read/write safety, and aggregation (tokens used per project, completion rates).
- **Event-Driven Over Polling:** Codex Orchestrator polls tmux sessions and checks file modification times. banto should use event-driven architecture: Agent SDK callbacks/events for state changes, WebSocket push to the dashboard (already planned), no need for marker files or filesystem polling.

### UX Pattern Lessons

- **Mid-Task Messaging: Don't Copy the tmux send-keys Approach:** Codex Orchestrator's mid-task messaging works because Codex CLI has native steer mode. banto should implement a proper structured message channel instead of terminal text injection — WebSocket-based message passing between dashboard and running sessions, message acknowledgment (delivered, processing, applied), and message history visible in the session timeline. This is a differentiator: banto can offer what codex-orchestrator cannot — reliable, structured mid-task communication.

### Business & Ecosystem Lessons

- **Agent-Agnostic Design:** Codex Orchestrator is tightly coupled to OpenAI's Codex CLI. banto's "CC only" principle (Claude Code only) is intentional, but the session abstraction layer should still be clean enough that the agent interface is well-defined. This makes testing easier and keeps options open.

---

## Sources

### Repository & Source Code

- [GitHub: kingbootoshi/codex-orchestrator — Main repository](https://github.com/kingbootoshi/codex-orchestrator)
- [src/tmux.ts — tmux session creation, message sending, output capture](https://github.com/kingbootoshi/codex-orchestrator/blob/main/src/tmux.ts)
- [src/session-parser.ts — Token, file modification, and summary extraction from session logs](https://github.com/kingbootoshi/codex-orchestrator/blob/main/src/session-parser.ts)
- [src/output-cleaner.ts — ANSI stripping, noise filtering, terminal output normalization](https://github.com/kingbootoshi/codex-orchestrator/blob/main/src/output-cleaner.ts)

### Articles & Posts

- [Medium: "Codex Orchestrator — Manage an Army of Coding Agents" — Overview and motivation](https://medium.com/coding-nexus/codex-orchestrator-manage-an-army-of-coding-agents-fdf56cac080d)
- [Medium: "Codex-Orchestrator — Run OpenAI Codex Agents in Parallel Using tmux" — Technical walkthrough](https://medium.com/coding-nexus/codex-orchestrator-run-openai-codex-agents-in-parallel-using-tmux-8e89edc6f6bd)
- [X: Bootoshi — Practical Codex tips after 3 months of daily use](https://x.com/KingBootoshi/status/1981239774318121434)
- [X: Bootoshi — Claude Opus 4.6 + Codex 5.3 parallel swarm workflow demonstration](https://x.com/KingBootoshi/status/2020797095775797307)

### Related Issues

- [openai/codex#4219 — Headless mode request for Codex CLI (blocks non-interactive automation)](https://github.com/openai/codex/issues/4219)
- [codex-orchestrator#5 — Linux compatibility bug (macOS-specific `script` command)](https://github.com/kingbootoshi/codex-orchestrator/issues/5)
- [openai/codex#12047 — Multi-agent TUI overhaul proposal](https://github.com/openai/codex/issues/12047)
