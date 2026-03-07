---
status: complete
priority: p2
issue_id: "017"
tags: [competitor-research, oss, bun, typescript, mid-task-messaging]
dependencies: []
---

# Deep Research: Codex Orchestrator

## Problem Statement

Codex Orchestrator (kingbootoshi/codex-orchestrator) has mid-task message sending and structured result extraction patterns directly applicable to banto. 215 stars, TypeScript/Bun.

## Recommended Action

Conduct deep research covering:
- Architecture (Bun, tmux sessions, job metadata storage)
- Mid-task redirection — sending course corrections to running agents
- Structured result extraction (--json flag converting terminal output to queryable data)
- Planning-execution separation (Claude plans, Codex executes)
- watch/send/capture/attach commands
- Job metadata format in ~/.codex-agent/jobs/
- Learnings for banto (especially mid-task messaging and result extraction)

## Resources

- **Repository:** https://github.com/kingbootoshi/codex-orchestrator

## Acceptance Criteria

- [x] Architecture documented
- [x] Mid-task messaging pattern analyzed
- [x] Structured result extraction evaluated
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/codex-orchestrator.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Complete

**By:** Claude Code

- Read repository README, source code (10 TypeScript files), GitHub issues, and configuration
- Analyzed architecture: Bun runtime, tmux sessions, file-per-job storage in `~/.codex-agent/jobs/`
- Documented mid-task messaging via `tmux send-keys` (relies on Codex CLI steer mode)
- Documented structured result extraction via regex parsing of terminal output (session-parser.ts + output-cleaner.ts)
- Gathered user feedback from X (author's 3+ months daily use), Medium articles, GitHub issues
- Identified 8 learnings for banto: structured messaging over terminal injection, SDK over terminal parsing, codebase map pattern, SQLite over file storage, event-driven over polling, dashboard as differentiator, notification as table stakes
- Research written to `.z/research/codex-orchestrator.md`
