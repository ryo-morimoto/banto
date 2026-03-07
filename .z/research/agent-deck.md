# Agent Deck (asheshgoplani/agent-deck) Research

Date: 2026-03-07
Sources:
- https://github.com/asheshgoplani/agent-deck
- https://github.com/AkCoding/agent-hand
- https://github.com/asheshgoplani/agent-deck/issues
- https://news.ycombinator.com/

Agent Deck is a Go/Bubble Tea TUI terminal session manager for AI coding agents, built on tmux. ~1,100 stars, MIT licensed, created December 2025, actively maintained by asheshgoplani with rapid releases (v0.1.0 to v0.22.0 in 3 months).

---

## Overview

Agent Deck is a terminal session manager for AI coding agents, built on top of tmux. It provides a single TUI dashboard for managing Claude Code, Gemini CLI, OpenCode, Codex, Aider, and arbitrary shell-based tools. The tagline is "mission control for your AI coding agents -- one terminal, all your agents, complete visibility."

The core problem it addresses: running multiple AI agent sessions creates chaos -- scattered terminal tabs, unclear status across sessions, difficulty switching between projects, and no central orchestration point.

Agent Deck solves this by creating namespaced tmux sessions (prefixed `agentdeck_*`) isolated from the user's existing tmux setup, then layering AI-aware intelligence on top: status detection, session forking, MCP management, and global search.

The project has grown aggressively from v0.1 to v0.22 in ~3 months, adding features like Docker sandboxing, conductor orchestration, remote SSH sessions, Telegram/Slack bridges, Discord bot support, and a web UI.

---

## Architecture

### Tech Stack

- **Language**: Go 1.24
- **TUI Framework**: Charm's Bubble Tea (bubbletea v1.3.10) + Lipgloss for styling + Bubbles for components
- **Session Backend**: tmux (sessions prefixed `agentdeck_*`)
- **Database**: SQLite (modernc.org/sqlite, pure Go driver)
- **Config**: TOML (`~/.agent-deck/config.toml`)
- **WebSocket**: gorilla/websocket (for web UI)
- **PTY**: creack/pty
- **File Watching**: fsnotify

### Session Lifecycle

1. User creates a session via TUI or CLI (`agent-deck add . -c claude`)
2. A tmux window is created within the agent-deck tmux session
3. The specified agent tool is launched inside the tmux window
4. Agent Deck polls the session to detect status changes
5. TUI preview pane shows ~500 lines of tmux output, refreshed every 2 seconds

### Smart Status Detection

Four-state model with intelligent polling:

| State | Indicator | Meaning |
|-------|-----------|---------|
| Running | Green dot | Agent actively working |
| Waiting | Yellow semicircle | Agent needs user input |
| Idle | Gray circle | Ready for commands |
| Error | Red X | Something failed |

Detection uses PTY pattern matching against the tmux pane content. The system queries session state without blocking. For Claude Code and Gemini CLI, it has tool-specific detection patterns (e.g., recognizing "thinking" vs "waiting for input" states). Other tools get generic status detection based on process activity.

A user on HN confirmed: "PTY pattern matching is the right call for state detection."

### Layout & Responsive Design

The TUI adapts to terminal width:
- Under 50 columns: list-only mode
- 50-79 columns: stacked layout
- 80+ columns: side-by-side (list + preview)

Navigation is vim-style (`j/k/h/l`), with number keys 1-9 for jumping to top-level groups. Tokyo Night color scheme with tool-specific icons.

### Web UI

Added as `agent-deck web` (default port 8420). Supports:
- `--read-only` mode for monitoring without control
- `--token` for bearer token auth
- Custom listen address
- WebSocket-based real-time updates

### State Persistence

Session metadata stored in SQLite (`state.db`). Recovery is possible from `sessions.json.migrated` if the DB corrupts. Critical warning: `tmux kill-server` destroys all sessions irrecoverably.

### TOML Configuration Example

```toml
# ~/.agent-deck/config.toml

[general]
default_tool = "claude"
theme = "tokyo-night"
preview_lines = 500
refresh_interval = 2  # seconds

[worktree]
enabled = true
location = "sibling"  # sibling | subdirectory | custom path

[mcp]
pool_all = true  # Share MCP processes across sessions via Unix sockets

[conductor]
auto_respond = true
escalation_timeout = 300  # seconds before escalating to human

[docker]
enabled = false
image = "agent-deck-sandbox"
mount_auth = true
```

### PTY Status Detection Pattern (Illustrative)

```go
// Simplified pattern matching for agent state detection
func estimateState(paneContent string, tool string) SessionState {
    switch tool {
    case "claude":
        if strings.Contains(paneContent, "╭─") && strings.Contains(paneContent, "thinking") {
            return StateRunning
        }
        if strings.Contains(paneContent, "│ > ") || strings.Contains(paneContent, "waiting for input") {
            return StateWaiting
        }
    case "codex":
        if strings.Contains(paneContent, "Generating") {
            return StateRunning
        }
    }
    // Generic: check process activity
    if isProcessActive(paneID) {
        return StateRunning
    }
    return StateIdle
}
```

**Takeaway for banto**: PTY pattern matching is pragmatic but fragile — patterns change with CLI version updates. banto's CC-only approach means maintaining patterns for one tool only, which is manageable.

---

## Well-Regarded Features

### Session Forking with Context Inheritance

Fork any Claude Code conversation instantly with `f` (quick) or `F` (customizable name/group). Each fork inherits the full conversation history, enabling:
- Exploring alternative implementation approaches without losing original context
- Parallel experimentation from a single knowledge base
- Low-cost branching of problem-solving strategies

This is Claude-specific (leverages Claude's session/conversation model). Other tools don't support forking.

### MCP Management

Toggle MCP servers per-project or globally without editing config files. Agent Deck handles the agent restart automatically. The TUI MCP Manager (`m` key) shows two columns (Attached / Available) across LOCAL and GLOBAL scopes with type-to-jump navigation.

### MCP Socket Pooling

Shares MCP processes across all sessions via Unix domain sockets, with a reconnecting proxy that auto-recovers from MCP crashes in ~3 seconds. Claims 85-90% reduction in MCP memory usage. Enable with `pool_all = true` in config.toml. This is a significant operational win for users running 10+ sessions.

### Global Search

Two tiers:
- **Local fuzzy search** (`/`): searches session titles and groups, 10-result max
- **Global search** (`G`): indexes `~/.claude/projects/` using regex and fuzzy matching with recency ranking, split-view with preview pane

Status filters work in both: `!` (running), `@` (waiting), `#` (idle), `$` (error).

### Conductor Orchestration

Persistent Claude Code sessions that monitor and orchestrate other sessions:
- Auto-respond when confident, escalate to human when uncertain
- Parent/child session relationships
- Telegram and Slack bridges for remote monitoring and control
- Multiple conductors per profile with separate identities

### Git Worktrees

Isolation via git worktrees so multiple agents can work on the same repo without conflicts. Configurable location (sibling, subdirectory, custom path). Finish workflow: merges, removes worktree, deletes session in one command.

### Docker Sandboxing

Run sessions in isolated containers with project directory bind-mounted read-write. Host tool auth shared into containers. One-shot mode: `agent-deck try "task"`.

### Skills Manager

Attach/detach Claude skills per project from a managed pool. State persisted in `.agent-deck/skills.toml`, materialized into `.claude/skills`. Pool-only workflow keeps operations deterministic.

---

## Poorly-Regarded Features / Pain Points

### Stability Issues

The earliest and most notable complaint (GitHub issue #4): "Extremely unstable, I did some work, pressed Ctrl+q, and the window went black (blank) immediately with no response." The user reported that with only 4 groups open (one session each), pressing Ctrl+Q during heavy edits caused 2-3 second hangs and black screens. While likely improved in later versions, this indicates early stability concerns with the tmux interaction layer.

### tmux Dependency & Fragility

- `tmux kill-server` or mass-killing tmux sessions destroys ALL agent-deck sessions irrecoverably
- Session metadata is backed up but tmux state is not recoverable
- Corrupted state.db requires manual recovery steps
- CLI flag ordering is strict (flags must come before positional args; placed after, they're silently ignored) -- a Go CLI library limitation that confuses users

### Feature Scope Creep

The project went from a simple session manager to including:
- Docker sandboxing
- Conductor orchestration with AI auto-responses
- Telegram/Slack/Discord bridges
- Remote SSH sessions
- OpenClaw gateway integration
- Web UI
- Skills management
- Web push notifications

22 minor versions in 3 months suggests rapid feature accumulation. GitHub issues reflect this: "redundant heartbeat mechanisms: systemd timer vs bridge.py heartbeat_loop" suggests internal architectural inconsistencies from fast iteration.

### No Mouse Support (Initially)

Multiple feature requests for mouse/trackpad scroll support in the TUI, indicating keyboard-only navigation is a barrier for some users.

### Platform Gaps

- No native Windows support (WSL only)
- macOS keychain credential extraction has edge cases for Docker sandbox mode
- Remote session management is still being refined (issues around duplicate entries, forked tmux processes)

### Documentation Gaps

Users report undocumented configuration options (e.g., `auto_cleanup`). The troubleshooting guide itself acknowledges "CLI changes not syncing to TUI" as a known issue requiring manual Ctrl+R refresh.

### Context Coordination Challenge

A HN user working with 16-30 parallel sessions noted that while session management matters, "the real bottleneck is understanding what each agent is doing, what's blocked, and coordinating tasks." Agent Deck's status detection shows state but not intent -- you know an agent is "running" but not *what* it's working on or whether it's stuck in a loop.

---

## User Feedback Summary

### GitHub Issues (18 open)

Key themes:
- **Remote operations**: requests for better SSH session management, bidirectional file sync
- **UI polish**: mouse support, group rearrangement, custom env variables for conductors
- **Platform**: Windows native support request
- **Architecture**: redundant heartbeat mechanisms identified by contributors
- **Documentation**: undocumented options causing confusion

### Hacker News

Agent Deck itself has not had a Show HN post. However, **Agent Hand** (a Rust rewrite inspired by agent-deck) was posted and generated discussion:
- Positive: "PTY pattern matching is the right call for state detection"
- Constructive: Recommendation to store metadata separately from tmux server for output replay and history search post-termination
- Suggestion to consider per-user socket namespacing early for multi-user isolation
- The creator of Agent Hand built it "after struggling with disorganization across 5+ concurrent Claude Code instances"

### Ecosystem Influence

Agent Deck has spawned derivative projects:
- **Agent Hand** (Rust rewrite)
- **Agent of Empires** (Rust alternative inspired by agent-deck)
- **wezterm-agent-deck** (WezTerm plugin showing status dots in tabs)
- A fork by weykon

This ecosystem influence suggests the core concept resonates, even if individual implementations diverge.

### Reddit / Twitter

No significant Reddit or Twitter discussion threads were found in searches. The project appears to spread primarily through GitHub discovery and developer tool lists (awesome-AI-driven-development, awesome-agent-orchestrators).

---

## Learnings for banto

### What Users Actually Want

- **The Real Problem Is Coordination, Not Monitoring.** The most insightful user feedback (from a user running 16-30 sessions): the bottleneck is not knowing session state, but understanding what each agent is doing, what's blocked, and coordinating work across sessions. Agent Deck's status indicators answer "is it running?" but not "should I intervene?" or "is it making progress on the right thing?" banto's task-centric model (tasks → sessions, not sessions → tasks) inherently addresses this better. A task carries intent ("implement feature X"), and the session is the execution unit.
- **Notification Bridges.** Telegram/Slack/Discord bridges for remote monitoring are relevant to banto's PWA strategy. Since banto is a web app, browser push notifications via service workers can provide similar functionality without external bridge dependencies. The key insight is that users want to know when an agent needs attention even when not actively watching the dashboard.
- **Session Forking Is High-Value, Claude-Specific.** Forking with full context inheritance is one of Agent Deck's most distinctive features and is tightly coupled to Claude Code's session model. banto should support this natively since it's CC-only. Unlike Agent Deck which has to handle multiple agent types, banto can go deeper on Claude-specific integrations.

### Technical Design Lessons

- **Status Detection Is Table Stakes.** Agent Deck's four-state model (running / waiting / idle / error) is the minimum viable status vocabulary. banto should support at least these four states. PTY pattern matching works but only tells you *state*, not *intent*. For banto's "one glance" purpose, augmenting status with a task summary (what the agent was asked to do) would address the coordination gap.
- **MCP Socket Pooling Is Operationally Significant.** 85-90% memory reduction for MCP processes is substantial for users running many sessions. banto should consider whether its container-based session architecture naturally provides MCP sharing, or if a pooling mechanism is needed.
- **tmux as Foundation: Strengths and Risks.** Agent Deck validates tmux as a pragmatic foundation. Benefits: battle-tested process isolation, background execution, terminal multiplexing. Risks: `tmux kill-server` destroys everything, state recovery is fragile. banto uses nixos-container for isolation instead, avoiding the tmux fragility problem.

### UX Pattern Lessons

- **Web UI Is an Afterthought vs Core.** Agent Deck added `agent-deck web` as an optional feature on port 8420. For banto, the web dashboard IS the product. This architectural difference means banto can optimize the entire experience for browser rendering, real-time WebSocket updates, and responsive layout.
- **Global Search Across Conversations.** Searching across all Claude conversations (via `~/.claude/projects/`) is valuable for context recall. banto should consider indexing session event logs for cross-session search, but this is a "later" feature -- the core loop is jot/throw/watch, not historical search.

### Business & Ecosystem Lessons

- **Feature Scope Discipline.** Agent Deck's trajectory from simple session manager to kitchen-sink orchestrator (Docker, Telegram, Slack, Discord, SSH, web UI, conductors, skills, worktrees) in 3 months is a cautionary tale. Maintenance burden (redundant heartbeat mechanisms), documentation gaps, stability risk. banto should resist this pattern. The "jot, throw, watch" loop is the core.
- **Conductor Pattern — Observe, Don't Adopt Yet.** The conductor concept (an AI session that monitors and orchestrates other sessions) is interesting but complex. For a single user, this introduces an additional cost center and a trust problem (when does the conductor escalate vs auto-respond?). banto should observe how this pattern plays out before adopting it.

---

## Sources

- [asheshgoplani/agent-deck — GitHub Repository](https://github.com/asheshgoplani/agent-deck)
- [Agent Hand — Rust rewrite inspired by agent-deck](https://github.com/AkCoding/agent-hand)
- [wezterm-agent-deck — WezTerm plugin for status dots](https://github.com/search?q=wezterm-agent-deck)
- [HN: Agent Hand Show HN (Rust terminal manager)](https://news.ycombinator.com/)
- [awesome-AI-driven-development](https://github.com/search?q=awesome-AI-driven-development)
- [Agent Deck GitHub Issues](https://github.com/asheshgoplani/agent-deck/issues)
