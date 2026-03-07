---
status: complete
priority: p3
issue_id: "018"
tags: [competitor-research, oss, bash, yaml-ipc, multi-agent]
dependencies: []
---

# Deep Research: Multi-Agent Shogun

## Problem Statement

Multi-Agent Shogun (yohey-w/multi-agent-shogun) uses YAML file-based communication for zero-coordination-cost multi-agent orchestration. 1,027 stars. Interesting coordination primitive.

## Recommended Action

Conduct deep research covering:
- Architecture (Bash 4+, 4-tier hierarchy, tmux sessions)
- YAML file-based messaging — zero coordination token cost
- Bottom-up skill discovery pattern
- Dashboard generation (dashboard.md)
- Learnings for banto

## Resources

- **Repository:** https://github.com/yohey-w/multi-agent-shogun

## Acceptance Criteria

- [x] Architecture documented
- [x] File-based coordination pattern evaluated
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/multi-agent-shogun.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Complete

**By:** Claude Code

Conducted deep research on multi-agent-shogun via GitHub repo, DeepWiki, Zenn, Qiita, and note.com.

**Key findings:**

- **Architecture**: 4-tier hierarchy (Shogun/Karo/Ashigaru/Gunshi) running in tmux sessions. Bash 4+ orchestration with inotifywait for event-driven communication. Up to 10 agents in parallel.
- **File-based coordination**: Two-layer system — YAML files for persistence (flock atomic writes), inotifywait kernel events for wake-up. Zero API calls for coordination. Single-writer principle per file prevents race conditions.
- **Skill discovery**: Bottom-up — Ashigaru notice patterns during work, propose candidates in reports, Karo aggregates to dashboard, user approves. No auto-creation to prevent bloat.
- **Dashboard**: dashboard.md is secondary/derived data maintained by Karo only. Primary source of truth is always the YAML queue files.
- **Known issues**: Karo bottleneck at 4+ Ashigaru, context compaction causing agents to forget constraints (v1.1.0 seppuku incident), idle agent wake-up limitation in Claude Code hooks.
- **Community**: Strong Japanese tech community adoption with multiple forks (FF15, Gemini CLI, ChatDev 2.0). 5x productivity claims. Claude Code Agent Teams integration replacing custom file-based IPC.
- **For banto**: Dashboard-as-derived-view pattern aligns well. Single-writer principle valuable. Compaction recovery awareness needed for agent runner. Multi-agent hierarchy itself is out of scope (banto = 1 task = 1 agent). File-based IPC was a pragmatic workaround — native platform features are the direction.

Research written to `.z/research/multi-agent-shogun.md`.
