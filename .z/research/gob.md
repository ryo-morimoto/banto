# gob (juanibiapina/gob) Research

Date: 2026-02-20
Sources:
- https://github.com/juanibiapina/gob

A Go-based process manager using a tmux-style daemon architecture with Unix domain socket communication. It manages background jobs with persistent history, stuck detection, and multiple client interfaces (CLI, TUI, JSON). Designed for local developer use alongside AI coding agents, it separates process lifecycle from display rendering by writing output to log files that any client can independently consume.

---

## Overview

- **Language**: Go | **License**: MIT | **Stars**: 44 | **Created**: 2025-11-17
- **Current version**: v3.3.0 (as of 2026-02-20)
- Client-server daemon model with Unix domain socket IPC
- Jobs scoped by working directory with persistent SQLite-backed history
- Multiple consumer interfaces (CLI, TUI, MCP (removed), JSON output)
- Designed for AI agent ergonomics (stuck detection, blocked jobs, clean CLI output)

---

## Architecture

### Client-Server Daemon Model

gob uses a **tmux-style daemon architecture**. The daemon is a long-running background process that owns all managed jobs as child processes. Clients (CLI, TUI, programmatic) connect to the daemon over a **Unix domain socket** at `$XDG_RUNTIME_DIR/gob/daemon.sock`.

**Startup flow:**

1. Any CLI command (e.g., `gob run make test`) calls `NewClient()`.
2. If connection to the socket fails, the client auto-starts the daemon by spawning `gob daemon` as a detached subprocess with nil stdin/stdout/stderr.
3. The client polls for socket availability (up to 20 retries, ~2s total).
4. Once connected, the client sends a JSON request and reads a JSON response.

**Connection model:**

- **Request-response**: Most commands open a socket, send one request, receive one response, then close. The daemon closes the connection after responding.
- **Publish-subscribe**: `subscribe` requests maintain a long-lived connection. The daemon broadcasts events to all subscribers, filtered by workdir. A 5-second write deadline prevents blocking on dead clients.

**Daemon lifecycle:**

- Writes PID to `$XDG_RUNTIME_DIR/gob/daemon.pid`.
- Handles SIGINT/SIGTERM for graceful shutdown.
- On shutdown: closes all subscriber connections, stops all running jobs, removes socket and PID files.
- Records clean shutdown state in SQLite (`daemon_state` table) to detect crashes on next startup.
- On crash recovery: detects orphan processes via `daemon_instance_id` on runs, kills them.

**Takeaway**: PID ファイル + clean shutdown フラグ + instance_id によるクラッシュリカバリは banto のサーバーに直接適用可能。サーバー再起動時に「前回正常終了したか」を SQLite で判定し、異常終了なら orphan セッションを検出・クリーンアップすべき。

### Process Management (separated from rendering)

This is gob's key architectural insight. The daemon manages processes through **interface-based abstraction**, completely decoupled from any UI:

```
ProcessExecutor (interface)  -->  RealProcessExecutor (production)
                             -->  FakeProcessExecutor (testing)

ProcessHandle (interface)    -->  Pid(), Wait(), Signal(), IsRunning()
```

**Process isolation details:**

- Each spawned process gets `Setpgid: true` (new process group), enabling group-level signal delivery via `syscall.Kill(-pid, sig)`.
- Stdout/stderr redirect to **separate log files** on disk. Stdin connects to `/dev/null`.
- The daemon closes file descriptors after spawn, so the child's lifecycle is independent.
- Any client (CLI, TUI, AI agent) can tail log files to "see" output -- the process itself never writes to a terminal.

**This is the critical separation**: processes write to files, and rendering (TUI, CLI follow, etc.) reads from those files independently. The process has no concept of who is watching it.

**Takeaway**: プロセス/表示分離は banto の根幹設計と完全に一致する。gob が log file ベースで実現していることを、banto は session_events テーブル + WebSocket で実現する。エージェントはテーブルに書き、ブラウザは WebSocket で読む。両者は互いを知らない。

### Multiple Interfaces

All interfaces consume the same daemon protocol:

| Interface | Implementation | Use Case |
|-----------|---------------|----------|
| CLI | `cmd/*.go` (cobra) | Agents, scripts, quick commands |
| TUI | `internal/tui/` (Bubble Tea + lipgloss) | Human monitoring |
| MCP | Added in v1.1, later removed | Agent integration |
| JSON output | `--json` flag on most commands | Programmatic consumption |

The TUI subscribes to daemon events and renders five panels: Jobs, Ports, Runs, Stdout, Stderr. It polls log files every second for updates.

**Takeaway**: 同一 daemon protocol を CLI / TUI / MCP / JSON が消費する設計は、banto の「同一 API を Web UI / PWA / 将来の CLI が消費する」設計と同型。API ファーストで設計すれば、UI は何でも載せ替えられる。

### Directory-Scoped Jobs

Jobs are scoped by `workdir` (the directory where `gob run` or `gob add` is executed). The `jobs` table has a `UNIQUE(command_signature, workdir)` constraint. When the TUI or `gob list` runs, it filters by the current working directory. Subscribers are also filtered by workdir, so a TUI in `/project-a` only sees events for that directory.

### Gobfile Configuration

Projects can define `.config/gobfile.toml`:

```toml
[[job]]
command = "make dev-server"
description = "Development server"
autostart = true

[[job]]
command = "rm -rf /"
description = "DO NOT RUN - dangerous cleanup"
blocked = true
```

Properties: `command`, `description`, `autostart` (default false since v3.0), `blocked`.

**Takeaway**: `blocked` フラグで危険なコマンドの実行を防ぐパターンは、banto でも「禁止操作リスト」として採用すべき。エージェントに渡すタスクに制約を設定できる仕組み。

### SQLite Schema

#### Tables (after all migrations)

**daemon_state** -- Key-value store for daemon metadata:
```sql
CREATE TABLE daemon_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```
Used for: clean shutdown flag, daemon instance ID.

**jobs** -- Persistent job definitions with aggregated statistics:
```sql
CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    command_json TEXT NOT NULL,         -- JSON array of command parts
    command_signature TEXT NOT NULL,    -- Deduplication key
    workdir TEXT NOT NULL,
    description TEXT,
    blocked INTEGER NOT NULL DEFAULT 0,
    next_run_seq INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    run_count INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    success_total_duration_ms INTEGER NOT NULL DEFAULT 0,
    failure_total_duration_ms INTEGER NOT NULL DEFAULT 0,
    min_duration_ms INTEGER,
    max_duration_ms INTEGER,
    UNIQUE(command_signature, workdir)
);
```

**runs** -- Individual execution records:
```sql
CREATE TABLE runs (
    id TEXT PRIMARY KEY,               -- e.g., "abc-1", "abc-2"
    job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    pid INTEGER NOT NULL,
    status TEXT NOT NULL,              -- "running" or "stopped"
    exit_code INTEGER,                 -- NULL while running, NULL if killed
    stdout_path TEXT NOT NULL,         -- Path to stdout log file
    stderr_path TEXT NOT NULL,         -- Path to stderr log file
    started_at TEXT NOT NULL,
    stopped_at TEXT,
    daemon_instance_id TEXT NOT NULL   -- For crash recovery
);
```

#### Schema Design Choices

- **Denormalized statistics on jobs table**: `run_count`, `success_count`, `failure_count`, `success_total_duration_ms`, etc. are maintained incrementally on the jobs row rather than computed from runs. This avoids expensive aggregation queries.
- **Separate success/failure duration tracking** (migration 00003): Enables separate average calculation for successful vs failed runs.
- **Command as JSON array**: Stores `["make", "test"]` not `"make test"`, preserving argument boundaries.
- **Ports are NOT persisted**: `PortInfo` is in-memory only, refreshed by polling `/proc`.

**Takeaway**: 非正規化統計 (success_count, total_duration を親テーブルにインクリメンタル保存) は banto の tasks テーブルに直接適用すべき。セッション完了時に task 行の統計を更新すれば、ダッシュボード表示時に JOIN/集計が不要になる。daemon_instance_id によるクラッシュリカバリも必須。

### Stuck Detection Algorithm

#### Constants

```
DefaultStuckTimeoutMs = 5 minutes   (for jobs with no history)
NoOutputWindowMs      = 1 minute    (inactivity threshold)
MinimumHistoryRuns    = 3           (minimum successful runs before using average)
```

#### CalculateStuckTimeout

```
if job has >= 3 successful runs:
    timeout = AverageDurationMs + 60000ms (1 minute)
else:
    timeout = DefaultStuckTimeoutMs (5 minutes)
```

`AverageDurationMs` = `success_total_duration_ms / success_count` (only successful runs contribute).

#### Detection During Execution

When following a job (`gob run` or `gob await`), a goroutine monitors two conditions simultaneously:

1. **Process completion**: polls `process.IsProcessRunning(pid)`.
2. **Stuck condition**: `elapsed_time > timeout AND no_output_for > 1 minute`.

Both conditions must be true for stuck detection to trigger: the job must have exceeded its expected duration AND must have been silent for at least 1 minute.

#### When Stuck is Detected

- The follow/await command returns early (exits with a message).
- The job **continues running** in the background.
- User sees: `"Job [ID] possibly stuck (no output for 1m)"` with suggested recovery commands (`gob stdout`, `gob await`, `gob stop`).

This is designed for AI agent ergonomics: the agent gets unblocked and can decide what to do, rather than waiting indefinitely.

**Takeaway**: Stuck detection は banto の「一目で把握する」ゴールに直結する。実装コストは低い (平均所要時間 + 1 分の閾値 + 無出力検知)。ダッシュボードで stuck セッションを視覚的にハイライトすべき。auto-terminate はせず、ユーザー判断に委ねる gob の方針が正しい。

### Run History and Statistics

#### Tracked Metrics

Per-job (aggregated on `jobs` table):
- `run_count` -- total completed runs
- `success_count` -- runs with exit code 0
- `failure_count` -- runs with non-zero exit code
- `success_total_duration_ms` -- cumulative duration of successful runs
- `failure_total_duration_ms` -- cumulative duration of failed runs
- `min_duration_ms` -- fastest run ever
- `max_duration_ms` -- slowest run ever

Computed at read time:
- `AverageDurationMs()` = success_total_duration_ms / success_count
- `FailureAverageDurationMs()` = failure_total_duration_ms / failure_count
- `SuccessRate()` = (success_count / run_count) * 100

Per-run (on `runs` table):
- PID, status, exit code, start/stop timestamps, stdout/stderr file paths

#### Progress Estimation

The TUI shows a progress bar for running jobs. Progress = `elapsed_time / average_duration_ms`, capped at 100%. Only jobs with >= 3 successful runs get a progress bar; others show no estimate.

#### Design Note: Killed Processes

Processes killed via SIGTERM/SIGKILL have `exit_code = NULL` (not 0 or non-zero). They count toward `run_count` but NOT toward `success_count`, `failure_count`, or any duration statistics. This prevents signal kills from skewing averages.

**Takeaway**: Kill されたプロセスを統計から除外する設計は重要。banto でもユーザーが手動停止したセッションは duration 統計に含めないようにすべき。progress bar (elapsed / average) もダッシュボードに採用可能。

### Port Monitoring

Uses `gopsutil` to inspect `/proc` for listening sockets. Recursively walks the process tree from the root PID, collecting all descendants. For each process, filters connections by `Status == "LISTEN"`.

`PortInfo` struct: port number, protocol (tcp/tcp6/udp/udp6), PID, bound address.

Ports are cached per-job and compared on refresh. `EventTypePortsUpdated` is only emitted when the port set changes, preventing unnecessary broadcasts.

**Takeaway**: nixos-container 内のポート監視は、コンテナのネットワーク namespace を `/proc` から直接読めないため gob とは異なるアプローチが必要。`machinectl` 経由か container 内エージェントからの自己申告が現実的。

---

## Well-Regarded Features

### Shared Process Visibility
The core value proposition. From the v1.0 discussion: "The coding agent runs `gob` CLI while I look and interact almost exclusively with the TUI. It runs super smooth." The author uses it daily with Claude Code, Crush, and Codex.

### Daemon Architecture (v0.12.0)
The switch from detached processes to a daemon was called out as a foundational improvement enabling: "Better lifetime control, reliable status tracking, real-time multi-client updates."

### Persistent Jobs with History (v2.0.0)
"Jobs transformed from ephemeral processes to persistent entities with execution history." This enabled statistics, history browsing, and crash recovery.

### Stuck Detection (v3.0.0)
Listed as a highlight in the v3.0.0 release announcement. Directly addresses agent ergonomics -- agents should not block indefinitely waiting for a process.

### Blocked Jobs (v3.0.0)
Prevents dangerous commands from being executed by agents. The gobfile configuration allows marking commands as blocked.

---

## Poorly-Regarded Features / Pain Points

### Noisy Output for Agents (Issue #11, open)
Agent consumers of `gob` output lose tokens parsing extra formatting and context. The suggested fix: redirect gob's own output to stderr so agents only see the job's stdout. This is still open as of the latest data.

### MCP Server Added Then Removed
An MCP server was added in v1.1 (Issue #10) but later removed. The reason is unclear from available data, but it suggests the maintenance burden wasn't justified or the approach was wrong.

### Breaking Changes Across Major Versions
Three major versions in ~2 months (v1 to v3). Key breaks:
- `autostart` default changed from true to false (v3.0)
- Daemon no longer auto-restarts on version mismatch -- requires manual `gob shutdown`
- `await-any` and `await-all` being removed in upcoming release

### No Remote/Network Access
The Unix socket architecture is inherently local. No WebSocket, HTTP API, or remote access capability. This is fine for gob's use case (local dev machine) but limits dashboard/mobile scenarios.

### Low Community Engagement
44 stars, 0 forks, only 3 issues (2 from external users). Discussions are all announcements from the maintainer with 0 comments. The tool works well for its author but hasn't attracted a community yet.

---

## User Feedback Summary

Community engagement is very limited (44 stars, 0 forks, 3 issues total). Most feedback comes from the author's own usage notes and release announcements. The 2 external issues focus on agent integration ergonomics (noisy output, MCP support), suggesting the primary audience beyond the author is AI agent tooling developers. No external discussions or comments exist on release announcements.

---

## Learnings for banto

### What Users Actually Want

- **Shared process visibility** is the core value: one consumer runs the process, another watches. gob proves this works with log files + multiple clients; banto achieves it with session_events + WebSocket.
- **"One glance" status**: stuck detection, progress bars, and success rates all serve the same goal -- surface what needs attention without digging. This aligns directly with banto's "一目で把握する" purpose.
- **Safety guardrails for agents**: the `blocked` flag pattern shows that users want to constrain what agents can do, not just what they should do.

### Technical Design Lessons

- **Process/terminal separation is validated**: gob's architecture directly parallels banto's approach:

  | gob | banto |
  |-----|-------|
  | Daemon manages processes, writes to log files | Server manages agent sessions, captures output |
  | CLI/TUI/agents read log files independently | Web UI renders terminal output independently |
  | Process has no concept of who is watching | Agent session has no concept of the dashboard |
  | Unix socket protocol between client and daemon | WebSocket/HTTP between browser and server |

- **Denormalized statistics on parent entities**: storing `run_count`, `success_total_duration_ms`, etc. directly on the `jobs` row avoids expensive aggregation queries. Applicable to banto's tasks table.
- **Separate success/failure duration tracking**: enables meaningful averages without killed/cancelled runs skewing data.
- **daemon_instance_id for crash recovery**: each run records which daemon instance spawned it. On restart, orphan runs can be detected and cleaned up. banto should track similar instance IDs for session recovery.
- **CASCADE deletes from parent to child**: simplifies cleanup (jobs -> runs, tasks -> sessions).
- **Stuck detection algorithm**: simple and effective (average duration + threshold + inactivity window). Low implementation cost for high dashboard value.
- **Write deadline on subscriber connections**: gob uses a 5-second write deadline to prevent dead subscribers from blocking broadcasts. banto should do the same for WebSocket connections.

### UX Pattern Lessons

- **Progress estimation**: `elapsed_time / average_duration_ms` capped at 100%, shown only after 3+ successful runs. Simple and useful for dashboards.
- **Killed processes excluded from statistics**: processes terminated by signal have `exit_code = NULL` and don't affect duration averages. banto should exclude user-cancelled sessions similarly.
- **Event filtering by scope**: gob filters events by workdir so a TUI in `/project-a` only sees that project's events. banto can filter WebSocket events by project.
- **Auto-terminate vs. surface**: gob does not auto-terminate stuck jobs, only surfaces the condition. This is the right approach for banto -- highlight stuck sessions visually, let the user decide.

### Business & Ecosystem Lessons

- **gob does NOT solve what banto aims to**: no web UI (terminal-only), no real terminal rendering (plain text logs), no agent orchestration (generic processes), no multi-project overview (directory-scoped), no remote access (Unix socket only). These gaps define banto's differentiation.
- **MCP added then removed**: suggests that protocol-level agent integration may not be worth the maintenance cost in early stages. Focus on CLI/HTTP first.
- **Rapid breaking changes** (3 major versions in 2 months) are acceptable for a solo-user tool but would be problematic if banto gains users. Stabilize interfaces early.
- **Low community despite strong design**: good architecture alone doesn't attract users. Terminal-only UX limits the audience. Web-based dashboards have broader appeal.

---

## Sources

- https://github.com/juanibiapina/gob
