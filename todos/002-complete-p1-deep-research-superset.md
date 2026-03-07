---
status: complete
priority: p1
issue_id: "002"
tags: [competitor-research, desktop-app, multi-agent, freemium]
dependencies: []
---

# Deep Research: Superset

## Problem Statement

Superset (superset.sh) is an Electron desktop app for running 10+ parallel coding agents with built-in diff viewer and IDE integration. Need deep investigation as a desktop-app competitor.

## Recommended Action

Conduct deep research covering:
- Architecture (Electron, daemon, git worktree, IDE integration)
- Well-regarded features: built-in diff viewer, persistent daemon, zero telemetry
- Poorly-regarded features / pain points: freemium model reactions, platform limitations
- User feedback
- Learnings for banto

## Resources

- **Website:** https://superset.sh
- **Repository:** https://github.com/superset-sh/superset

## Acceptance Criteria

- [x] Architecture documented
- [x] Top well-regarded features identified with user evidence
- [x] Top pain points identified with user evidence
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/superset.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

**Key Learnings:**
- Daemon process (ELECTRON_RUN_AS_NODE) keeps PTY sessions alive across app restarts via Unix socket with NDJSON/binary framing
- Agent state detection via hook scripts that POST to local HTTP server (Claude hooks, Cursor hooks)
- Local SQLite (better-sqlite3 + Drizzle) for workspace state, Neon PostgreSQL for cloud/team synced via Electric SQL
- Monaco DiffEditor for built-in diff review (editable diffs)
- Users love: parallel execution + worktree isolation, terminal persistence, notifications
- Major pain points: macOS-only, mandatory cloud auth for local features (#1722), analytics blocking breaks app (#2037), shell wrapper conflicts (#1812), diff viewer CPU spikes (#1703), ELv2 license misleadingly presented as "open source"
- banto advantage: no mandatory auth for local features, web dashboard simpler than Electron for single-user local case
