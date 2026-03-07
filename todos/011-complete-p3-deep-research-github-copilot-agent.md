---
status: complete
priority: p3
issue_id: "011"
tags: [competitor-research, first-party, github, issue-to-pr, commercial]
dependencies: []
---

# Deep Research: GitHub Copilot Coding Agent

## Problem Statement

GitHub's native Agents Panel for assigning issues to Copilot. Represents the "platform incumbent" approach to agent task management.

## Recommended Action

Conduct deep research covering:
- Architecture (Agents Panel, cloud execution environment)
- Well-regarded features: native GitHub integration, zero setup, issue-to-PR
- Poorly-regarded features: accuracy, limitations, pricing
- User feedback from real developers
- Learnings for banto

## Resources

- https://github.blog/changelog/2025-10-28-a-mission-control-to-assign-steer-and-track-copilot-coding-agent-tasks/

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/github-copilot-agent.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Complete

**By:** Claude Code

Deep research completed. Key findings:

**Architecture:** Ephemeral GitHub Actions-powered sandbox per task. 1 task = 1 PR. Agent self-reviews via Copilot Code Review before opening PR. Mission Control (Oct 2025) provides centralized multi-repo task orchestration with real-time steering. Custom agents defined as Markdown files at `.github/agents/`.

**Well-regarded:** Zero-friction GitHub integration, issue-to-PR async workflow, self-review, built-in security scanning (CodeQL/secret scanning free), Mission Control multi-task orchestration, custom agents ecosystem.

**Poorly-regarded:** 90+ second cold boot (GitHub Actions spin-up), 70-80% reliability on complex tasks, premium request pricing backlash (model multipliers, silent downgrades, bait-and-switch perception), "productivity illusion" (faster code writing but not faster delivery), code accretion, single-repo limitation per task.

**Key learnings for banto:** (1) Local execution = no cold boot = core differentiator. (2) Session steering is essential. (3) Multi-task orchestration is the real productivity gain. (4) banto's separate session model is more flexible than 1-task-1-PR. (5) Status-at-a-glance validates banto's design direction. (6) Self-review before human review is worth adopting.
