---
status: complete
priority: p2
issue_id: "007"
tags: [competitor-research, orchestration, ci-aware, oss]
dependencies: []
---

# Deep Research: Composio Agent Orchestrator

## Problem Statement

Composio Agent Orchestrator is a CI-aware fleet management tool. Runtime-agnostic (tmux/Docker) with auto CI fix.

## Recommended Action

Conduct deep research covering:
- Architecture (runtime-agnostic: tmux/Docker, CI integration)
- Well-regarded features: auto CI fix, PR-per-agent, agent-agnostic
- Poorly-regarded features / pain points
- User feedback
- Learnings for banto

## Resources

- **Repository:** https://github.com/ComposioHQ/agent-orchestrator

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/composio.md`

## Work Log

### 2026-03-07 - Research Completed

**By:** Claude Code

Conducted deep research on Composio Agent Orchestrator. Sources: GitHub repo/issues, pkarnal.com blog post, Composio blog, MarkTechPost coverage, HN threads (Show HN #47219229, Ask HN #46993479).

Key findings:
- Plugin-based architecture with 8 swappable slots (runtime, agent, workspace, tracker, SCM, notifier, terminal, lifecycle)
- Self-built by 30 Claude agents in 8 days (~40k LoC TypeScript, 17 plugins, 3,288 tests)
- Strong: CI self-correction, PR-per-agent isolation, agent-agnostic, review comment handling
- Weak: mid-session drift, no conflict reconciler, setup complexity, stuck sessions, observability gaps
- For banto: dashboard not orchestrator, activity detection via session files, optimize for 3-8 sessions not 30+, review is the real bottleneck

Research written to `.z/research/composio.md`.

### 2026-03-07 - Task Created

**By:** Claude Code
