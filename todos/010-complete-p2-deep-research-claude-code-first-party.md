---
status: complete
priority: p2
issue_id: "010"
tags: [competitor-research, first-party, anthropic, agent-teams, remote-control]
dependencies: []
---

# Deep Research: Claude Code First-Party Features

## Problem Statement

Anthropic is building first-party features (Tasks, Agent Teams, Remote Control) that overlap with banto's scope. Need to understand capabilities, limitations, and how banto can coexist/differentiate.

## Recommended Action

Conduct deep research covering:
- **Claude Code Tasks**: persistent task lists, cross-session state sharing, filesystem-based
- **Claude Code Agent Teams**: multi-agent coordination, team lead/teammate pattern, inter-agent messaging
- **Claude Code Remote Control**: mobile access via QR code, Max tier restriction
- Each feature's architecture and constraints
- User evaluations (positive and negative)
- How banto coexists with or differentiates from these features

## Resources

- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/remote-control
- https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across/

## Acceptance Criteria

- [x] Each feature's architecture and constraints documented
- [x] User evaluations collected
- [x] banto differentiation strategy outlined
- [x] Research written to `.z/research/claude-code-first-party.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

Conducted deep research on three Claude Code first-party features:
- **Tasks**: Filesystem-based (`~/.claude/tasks/`), DAG dependencies, cross-session via `CLAUDE_CODE_TASK_LIST_ID`, atomic writes. Replaced old Todos in v2.1.
- **Agent Teams**: Experimental. Team lead/teammate pattern, shared task list, inter-agent mailbox, file locking for task claims. 3-4x token cost. Small focused teams (2-3) outperform large ones.
- **Remote Control**: Outbound-only HTTPS polling, one session at a time, 10-min network timeout. Permissions friction kills autonomous workflows. Validates mobile monitoring use case.

Key finding: banto's core value is the **persistent multi-project dashboard** -- the single-screen overview that Claude Code's CLI-first architecture will never provide. Strategy: complement Claude Code by integrating with its filesystem-based state (`~/.claude/tasks/`, `~/.claude/teams/`), not compete with its internal features.

Research written to `.z/research/claude-code-first-party.md`.
