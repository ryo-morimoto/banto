---
status: complete
priority: p1
issue_id: "014"
tags: [competitor-research, oss, go, sqlite, daemon, process-management]
dependencies: []
---

# Deep Research: gob

## Problem Statement

gob (juanibiapina/gob) separates process management from terminal rendering — exactly the pattern banto needs for web-first approach. SQLite-backed state, persistent daemon, stuck detection. Only 44 stars but clean architecture.

## Recommended Action

Conduct deep research covering:
- Architecture (client-server daemon, SQLite persistence, process tree monitoring)
- Process management separated from terminal rendering — how is this achieved?
- Stuck detection: how does it determine average + 1 min threshold?
- Run history with statistics and progress estimation
- Directory-scoped jobs (projects by directory, not session)
- Port inspection across child process hierarchies
- Multiple interfaces (CLI, TUI, programmatic)
- Code quality, test coverage, architecture patterns
- Learnings for banto (especially daemon + SQLite + process/terminal separation)

## Resources

- **Repository:** https://github.com/juanibiapina/gob

## Acceptance Criteria

- [x] Architecture documented at code level
- [x] Process/terminal separation pattern analyzed
- [x] Stuck detection and progress estimation evaluated
- [x] SQLite schema and persistence strategy documented
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/gob.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

**Actions:**
- Discovered via GitHub-focused research
- Key insight: separation of process management from terminal rendering aligns with banto's web-first design
- Assigned p1 — architectural pattern is directly applicable

### 2026-03-07 - Research Completed

**By:** Claude Code

**Key Learnings:**
- Process/terminal separation: processes write to log files on disk, any client tails independently. Process has zero awareness of watchers — directly validates banto's approach
- SQLite schema: 3 tables (daemon_state KV, jobs with denormalized stats, runs with CASCADE delete). Stats maintained incrementally, not computed
- Stuck detection: `avg_success_duration + 1min` (needs ≥3 runs, else 5min default). Triggers when elapsed > timeout AND no output for 1min. Job keeps running, only waiting client unblocks
- Daemon: Unix socket + JSON protocol, auto-start, crash recovery via instance_id, event broadcasting filtered by workdir
- Limitations: no web UI, no real terminal emulation (plain text), no remote access, low adoption
