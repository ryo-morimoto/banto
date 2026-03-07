---
status: complete
priority: p2
issue_id: "006"
tags: [competitor-research, desktop-app, compare-merge, oss]
dependencies: []
---

# Deep Research: Crystal/Nimbalyst

## Problem Statement

Crystal/Nimbalyst (stravu/crystal) offers a compare-and-merge workflow for parallel agent sessions. Unique approach worth understanding.

## Recommended Action

Conduct deep research covering:
- Architecture (Electron, SQLite session persistence)
- Well-regarded features: parallel approach comparison, selective merge, session templates
- Poorly-regarded features / pain points
- User feedback
- Learnings for banto

## Resources

- **Repository:** https://github.com/stravu/crystal
- **Website:** https://nimbalyst.com

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/crystal-nimbalyst.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

- Researched Crystal (stravu/crystal) and its successor Nimbalyst
- Sources: GitHub repo, Nimbalyst docs/blog, HN discussions (3 threads), GitHub issues (16+ open), GitHub discussions, changelog
- Key findings:
  - Git worktree isolation per session is the core innovation and validated pattern
  - Crystal hit severe Electron performance issues (2800ms frame drops, 40%+ CPU from git polling)
  - Deprecated after ~8 months due to scope creep into editor/IDE territory (became Nimbalyst)
  - Session templates for parallel A/B testing well-regarded
  - Stability bugs and unanswered community questions eroded trust
- Top learnings for banto: worktree-per-session is right, avoid editor scope creep, WebSocket push over polling, "run N pick winner" is compelling
- Research written to `.z/research/crystal-nimbalyst.md`
