# Multi-Agent Shogun (yohey-w/multi-agent-shogun) Research

Date: 2026-03-07
Sources:
- https://github.com/yohey-w/multi-agent-shogun

Multi-agent-shogun is a Bash-based orchestration system that runs up to 10 AI coding CLI instances in parallel using tmux. It uses a feudal Japanese military hierarchy (Shogun -> Karo -> Ashigaru) and coordinates agents through YAML files on disk, achieving zero API coordination overhead. The system supports Claude Code, OpenAI Codex, GitHub Copilot, and Kimi Code.

---

## Overview

- **Repository**: https://github.com/yohey-w/multi-agent-shogun
- **Author**: yohey-w
- **Stars**: ~1,027 (as of 2026-03-07)
- **License**: Not specified in research

---

## Architecture

### 4-Tier Agent Hierarchy

| Role | Count | tmux Location | Responsibility |
|------|-------|---------------|----------------|
| Shogun | 1 | `shogun:0` | Strategic overseer. Receives human commands, delegates to Karo. Never executes tasks directly. |
| Karo | 1 | `multiagent:0.0` | Tactical manager. Decomposes tasks, assigns to Ashigaru, aggregates reports, maintains dashboard.md. |
| Ashigaru | 1-8 | `multiagent:0.1-0.8` | Workers. Execute assigned tasks in parallel. Each has dedicated files. |
| Gunshi | 1 | `multiagent:0.8` | Strategist/quality reviewer. Handles analysis, design review, and report aggregation. |

The hierarchy is strict: Shogun never bypasses Karo, Ashigaru never communicate with each other or directly with Shogun. This single-writer principle prevents conflicts.

### tmux Session Layout

- **Session `shogun`**: 1 pane for the Shogun agent
- **Session `multiagent`**: 9 panes in a 3x3 grid (Karo + up to 8 Ashigaru)

Each agent identifies itself via tmux `@agent_id` user option (stable across pane rearrangement, unlike pane indices).

### Technology Stack

- **Shell**: Bash 4.0+
- **Terminal multiplexer**: tmux 2.6+
- **Communication format**: YAML files
- **File monitoring**: inotifywait (kernel events, zero polling)
- **File locking**: flock (atomic writes)
- **Supported CLIs**: Claude Code (required for Shogun/Karo), OpenAI Codex, GitHub Copilot, Kimi Code

### Startup

`shutsujin_departure.sh` performs:
1. Cleanup of existing sessions
2. Queue file initialization
3. Session creation with 3x3 grid
4. Launch CLI on all agents
5. Start `inbox_watcher.sh` for each agent (9 processes)
6. Start `ntfy_listener.sh` if configured

Flags: `--clean` (reset queues), `--kessen` (all Opus mode), `--silent`, `--setup-only`.

### YAML File-Based Messaging

#### Two-Layer Communication

**Layer 1 — Persistence (YAML files):**
```
queue/
  shogun_to_karo.yaml          # Command delegation
  tasks/ashigaru{N}.yaml       # Task assignments (1 per worker)
  reports/ashigaru{N}_report.yaml  # Completion reports (1 per worker)
  inbox/{agent}.yaml           # Message queues
```

**Layer 2 — Wake-up (kernel events):**
- `scripts/inbox_write.sh` writes messages atomically using `flock`
- `scripts/inbox_watcher.sh` monitors inboxes via `inotifywait`
- Wake-up delivered via `/dev/pts/N` direct write (pty)

#### Zero Coordination Overhead

| Operation | Traditional Multi-Agent | multi-agent-shogun |
|-----------|------------------------|-------------------|
| Task delegation | 1 API call/agent | 0 (write YAML) |
| Status check | N API calls (polling) | 0 (read YAML) |
| Report aggregation | N API calls | 0 (read YAML files) |
| Wake-up notification | WebSocket/polling | 0 (kernel event) |
| **Total for 8 agents** | **24+ API calls/task** | **0 coordination calls** |

Cost claim: flat-rate CLI subscriptions (~$200/month total) vs. token-based API coordination (~$100+/hour for 8 Opus agents).

#### Race Condition Prevention

Each agent has dedicated files — no shared write targets:
- Ashigaru 1 reads only `queue/tasks/ashigaru1.yaml`, writes only `queue/reports/ashigaru1_report.yaml`
- `flock` ensures atomic writes to inbox files
- Single-writer principle for `dashboard.md` (only Karo writes)

#### Three-Phase Escalation for Agent Wake-up

When an agent is stuck or unresponsive:
1. Standard nudge (pty direct write)
2. Escape + nudge
3. `/clear` command (full session reset, agent recovers from YAML state)

#### Redo Protocol

When Karo redoes a task:
1. Write new task YAML with `redo_of: <old_task_id>`
2. Send `type: clear_command` inbox message
3. Infrastructure delivers `/clear` — agent session resets
4. Agent recovers via Session Start procedure, reads new YAML

### Bottom-Up Skill Discovery

Skills are not predefined templates — they emerge organically from actual work:

1. Ashigaru complete tasks and notice repeated implementation patterns
2. Ashigaru propose skill candidates in their report YAML
3. Karo aggregates proposals into the `dashboard.md` skill candidates section
4. User reviews and approves candidates
5. Approved skills become permanent, invocable by any agent via CLI commands

Key design decision: skills are NOT auto-created. The user must explicitly approve. Quote from README: "Automatic creation would lead to unmanageable bloat — only keep what you find genuinely useful."

### Dashboard Generation (dashboard.md)

- **Writer**: Karo only (single-writer principle)
- **Readers**: Shogun, human user
- **Content**: Worker assignments, progress (Running/Completed/Failed), skill candidates, quality metrics, items requiring user action (marked with emoji)
- **Trust level**: "dashboard.md is secondary data (karo's summary). Primary data = YAML files. Always verify from YAML." Agents recovering from crashes must not trust dashboard.md alone.

### Context Persistence Model

| Layer | Location | Persistence | Recovery Cost |
|-------|----------|-------------|---------------|
| 1. Memory MCP | `memory/shogun_memory.jsonl` | Survives `/clear` | N/A |
| 2. Project files | `config/`, `projects/`, `context/` | Survives `/clear` | ~800 tokens |
| 3. YAML Queue | `queue/` | Survives `/clear` | Varies |
| 4. Session context | `CLAUDE.md`, `instructions/` | Volatile (auto-reloaded) | ~5,000 tokens |

Total recovery cost post-`/clear`: ~6,800 tokens (42% reduction from previous design).

#### Session Recovery Protocol

All agents follow this on startup or after `/clear`:
1. Identify self via `tmux display-message`
2. Read memory graph (Karo/Gunshi only)
3. Read role-specific instructions file (mandatory — summaries don't preserve persona)
4. Rebuild state from YAML queue files
5. Verify forbidden actions, then work

### Model Routing via Bloom's Taxonomy

- **Ashigaru 1-4 (Sonnet)**: L1-L3 tasks (Remember, Understand, Apply)
- **Ashigaru 5-8 (Opus)**: L4-L6 tasks (Analyze, Evaluate, Create)
- Configurable via `--kessen` flag (all Opus for maximum capability)

### Safety Mechanisms

#### Forbidden Actions (Absolute Bans)

- `rm -rf` outside project tree, `git push --force`, `git reset --hard`
- `sudo`, `su`, privilege escalation
- `kill`, `killall`, `pkill`, `tmux kill-*`
- Pipe raw code to bash: `curl ... | bash`

#### Batch Processing QC Gate

For tasks with 30+ items:
1. Strategy review by Gunshi
2. Execute batch 1 only → Shogun QC
3. If QC fails: stop all agents, root cause analysis, fix, clean state, retry
4. If QC passes: execute remaining batches
5. Final QC on completion

Rationale: "A flawed approach repeated 15 batches = 15x wasted tokens."

---

## Well-Regarded Features

- **File-based state as source of truth**: All agent state lives in plain YAML files. Human-readable, version-controllable, debuggable. When things go wrong, you can inspect the exact state.
- **Single-writer principle**: Each file has exactly one writer. No locking contention, no merge conflicts. dashboard.md is written only by Karo. Each Ashigaru writes only to its own report file. Simple and effective for parallel execution.
- **Zero-polling architecture**: inotifywait + flock gives event-driven communication with zero CPU while idle.
- **Hierarchical delegation with clear boundaries**: The strict hierarchy (human -> Shogun -> Karo -> Ashigaru) prevents chaos. The principle of clear ownership per task is valuable.
- **Batch QC gate**: The "execute batch 1, QC, then proceed" pattern prevents catastrophic token waste.
- **Session recovery from persistent state**: Agents can recover from `/clear` by re-reading YAML files. The context persistence model (4 layers with different durability) is well-thought-out.
- **5x productivity increase** reported by users (note.com/sasuu)
- **"Netflix-watching mode"** — user does zero active work, just occasional approvals
- Spawned significant community activity: forks (FF15-themed, Gemini CLI port), derivatives (ChatDev 2.0 reproduction, RPG/anime themed variants)

---

## Poorly-Regarded Features / Pain Points

1. **Context compaction vulnerability (v1.1.0)**: Karo violated forbidden action F001 (self-executing tasks) after Claude Code's automatic context compression caused it to "forget" constraints. Fix: mandatory compaction recovery procedure in CLAUDE.md.
2. **tmux send-keys bugs**: Agents forgot to send Enter commands, halting processes. Later addressed with pty direct write approach.
3. **Ashigaru scaling ceiling**: Karo becomes a bottleneck with too many workers. 4 Ashigaru is a practical sweet spot for many users.
4. **Idle agent wake-up**: Claude Code's Stop hook only fires at turn end. Idle agents waiting at prompt never end a turn, so inbox checks don't trigger. No clean solution exists without future Claude Code hook improvements.
5. **Reporting hesitancy**: Karo agents sometimes hesitated to report back, fearing interruption of Shogun's work.

---

## User Feedback Summary

### Japanese Tech Community (Zenn, Qiita, note.com)

The system has generated significant traction in Japan, spawning forks and derivatives:
- **FF15-themed fork** (multi-agent-ff15): OpenCode + tmux port with 5 agents
- **Gemini CLI port**: Recreated for Google's Gemini CLI
- **ChatDev 2.0 reproduction**: Hierarchy replicated in ChatDev's YAML config
- **RPG/anime themed variants**: Guild Master + Party Members, Legend of the Galactic Heroes characters

### User-Reported Results

- One user reported **5x individual development capability increase** (note.com/sasuu)
- Same user found that **scaling beyond 4 Ashigaru caused Karo to freeze** — the middle manager bottleneck is real
- Creator (shio_shoppaize on Zenn) reported agents self-imposing enforcement rules like "violation = seppuku" without being prompted
- "Netflix-watching mode" — user does zero active work, just occasional approvals

### Claude Code Agent Teams Integration (2026)

Claude Code added native Agent Teams features that addressed many of the system's pain points:
- Replaced manual `tmux send-keys` with `SendMessage` API
- Added `TaskCreate/TaskUpdate/TaskList` for shared task visibility
- Delegate mode prevents leaders from executing tasks themselves
- Eliminated custom wrapper scripts (notify.sh, watchdog.sh)

This suggests the file-based coordination approach was a pragmatic workaround for missing platform features, and native tool support is the direction the ecosystem is moving.

### No Significant Reddit/HN Presence

Discussion is concentrated on Japanese tech platforms (Zenn, Qiita, note.com). No meaningful threads found on Reddit or Hacker News.

---

## Learnings for banto

### What Users Actually Want

1. **Transparency into agent state**: File-based state as source of truth aligns with banto's need for transparency ("watch the results"). Users want to inspect exactly what an agent is doing and why.

2. **Early QC before bulk execution**: The batch QC gate ("execute batch 1, QC, then proceed") prevents catastrophic token waste. banto could apply this principle: let users review early output before the agent continues.

3. **"Netflix-watching mode"**: Users want to delegate and only intervene for approvals. banto's "jot, throw, watch" flow targets exactly this.

4. **Skill discovery as emergent property**: The bottom-up skill discovery (agents propose patterns, user approves) is interesting for a future iteration. If banto tracks session outcomes, recurring successful patterns could surface as suggested task templates.

### Technical Design Lessons

1. **Single-writer principle**: Each file has exactly one writer. No locking contention, no merge conflicts. Simple and effective for parallel execution. For banto's simpler model (human -> task -> agent), the hierarchy overhead is unnecessary, but the principle of clear ownership per task is valuable.

2. **Zero-polling architecture**: inotifywait + flock gives event-driven communication with zero CPU while idle. This is relevant for banto's always-on server scenario — the system should not burn resources while waiting.

3. **Session recovery from persistent state**: Agents can recover from `/clear` by re-reading YAML files. The context persistence model (4 layers with different durability) is well-thought-out. banto's session_events table serves a similar purpose.

4. **Compaction recovery awareness**: LLM context compaction can cause agents to "forget" constraints. banto's agent runner should be aware of this — critical instructions should be reinforced, not just set once at session start.

5. **File-based IPC vs. database**: banto already uses SQLite for state. YAML files are appropriate for a Bash-based system without a database, but for banto's stack (Elysia + bun:sqlite), the database is the right persistence layer.

### UX Pattern Lessons

1. **Dashboard as derived view**: dashboard.md is explicitly secondary data derived from YAML source files. banto's dashboard should similarly be a derived view from session_events and task state, never the source of truth.

2. **Behavioral gamification**: Streak tracking, "Eat the Frog" markers, Sengoku-era persona — these are engagement features for a single developer's personal workflow. banto's "function over form" principle suggests deferring this.

### Business & Ecosystem Lessons

1. **Cost model insight**: The flat-rate CLI subscription model ($200/month for unlimited agent work) vs. API token costs ($100+/hour) is the economic foundation of the entire system. banto targets the same cost model (CC CLI subscriptions).

2. **Platform convergence**: Claude Code's native Agent Teams features replaced many of multi-agent-shogun's custom workarounds (tmux send-keys, inbox watchers, wake-up scripts). File-based coordination was a pragmatic workaround for missing platform features. banto should build on native platform capabilities rather than working around them.

3. **Multi-agent orchestration complexity**: banto is 1 task = 1 session = 1 agent. The entire Shogun hierarchy (10 agents, 3 tiers, inbox system, wake-up escalation) solves a problem banto intentionally does not have.

4. **tmux as agent runtime**: banto runs agents in containers, not tmux panes. The tmux session management complexity (pane identification via @agent_id, 3x3 grid layout, pty direct write) is an implementation detail that banto replaces with its container abstraction.

---

## Sources

- [GitHub Repository](https://github.com/yohey-w/multi-agent-shogun)
- [CLAUDE.md](https://github.com/yohey-w/multi-agent-shogun/blob/main/CLAUDE.md)
- [instructions/shogun.md](https://github.com/yohey-w/multi-agent-shogun/blob/main/instructions/shogun.md)
- [DeepWiki Analysis](https://deepwiki.com/yohey-w/multi-agent-shogun)
- [Zenn: Claude Code Multi-Agent System (shio_shoppaize)](https://zenn.dev/shio_shoppaize/articles/5fee11d03a11a1)
- [Zenn: v1.1.0 Karo Seppuku Story (shio_shoppaize)](https://zenn.dev/shio_shoppaize/articles/8870bbf7c14c22)
- [note.com: 5x Productivity (sasuu)](https://note.com/sasuu/n/n23e0fa125d13)
- [note.com: Custom Modifications (sasuu)](https://note.com/sasuu/n/n6b7f9c0beeb0)
- [Qiita: Agent Teams Integration (maru_cc)](https://qiita.com/maru_cc/items/cb39fab06de561edd8c4)
- [note.com: Gemini CLI Port (Schwarz)](https://note.com/schwarz4631/n/nf3b5b37e5732)
