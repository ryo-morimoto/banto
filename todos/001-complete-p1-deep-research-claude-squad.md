---
status: complete
priority: p1
issue_id: "001"
tags: [competitor-research, multi-session, tui, oss]
dependencies: []
---

# Deep Research: Claude Squad

## Problem Statement

Claude Squad (smtg-ai/claude-squad) is the most popular OSS tool in the agent management space (6k+ stars). Need deep investigation of architecture, user sentiment, and design patterns to inform banto's design.

## Findings

To be filled during research.

## Proposed Solutions

N/A - Research task.

## Recommended Action

Conduct deep research covering:
- Architecture (Go/bubbletea TUI, git worktree management, tmux integration)
- Well-regarded features: auto-accept mode, worktree isolation, agent-agnostic support
- Poorly-regarded features / pain points: extract from GitHub Issues, Reddit, HN
- User feedback and real-world usage patterns
- Learnings for banto

## Resources

- **Repository:** https://github.com/smtg-ai/claude-squad
- **Related research:** `.z/research/competitor-tools.md`

## Acceptance Criteria

- [x] Architecture documented (runtime, data flow, key abstractions)
- [x] Top 5+ well-regarded features identified with user evidence
- [x] Top 5+ pain points / poorly-regarded aspects identified with user evidence
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/claude-squad.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

**Actions:**
- Created research task from competitor survey
- Identified as highest priority due to market position (most popular OSS)

### 2026-03-07 - Research Completed

**By:** Claude Code

**Key Learnings:**
- Go + bubbletea TUI. Each session = tmux session + git worktree. State as JSON in ~/.claude-squad/. No database
- Popular because: first mover (Mar 2025), worktree isolation genuinely useful, zero-config, free/OSS
- Critical problems:
  - Maintenance stalling (#214 +16, #250 +11), two part-time maintainers
  - UI freezing: synchronous tmux capture-pane blocks event loop (5 sessions = 13s freeze)
  - tmux capture-pane crashes (#216 +11), most common bug
  - AutoYes broken: brittle string matching of pane content
  - Worktrees break project setups (missing node_modules, .env, ports) — no setup hooks
  - No reboot persistence, single repo only
- banto advantages: nixos-containers solve worktree's biggest pain (deps/ports/env isolation), SQLite over JSON, async I/O from day one, structured Agent SDK events instead of output parsing
