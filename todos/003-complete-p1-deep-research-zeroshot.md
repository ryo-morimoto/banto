---
status: complete
priority: p1
issue_id: "003"
tags: [competitor-research, task-pipeline, issue-to-pr, oss]
dependencies: []
---

# Deep Research: Zeroshot

## Problem Statement

Zeroshot (covibes/zeroshot) is the closest competitor to banto's "task → agent → result" pipeline. Issue → validated code with multi-stage validation. Critical to understand deeply.

## Recommended Action

Conduct deep research covering:
- Architecture (planner → implementer → validators loop, isolated environments)
- Well-regarded features: issue backend integrations (GitHub/GitLab/Jira), multi-stage validation, agent-agnostic
- Poorly-regarded features / pain points
- User feedback
- Learnings for banto (especially task-to-agent pipeline design)

## Resources

- **Repository:** https://github.com/covibes/zeroshot

## Acceptance Criteria

- [x] Architecture documented (pipeline stages, validation flow)
- [x] Top well-regarded features identified with user evidence
- [x] Top pain points identified with user evidence
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/zeroshot.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

**Key Learnings:**
- Message-driven multi-agent orchestrator built on SQLite-backed pub/sub
- Pipeline: Conductor → Planner → Worker → Validators (blind, parallel) → iterate
- **Blind validation** (validators never see worker context) is the core insight — worth considering even in single-agent mode
- SQLite event ledger for crash recovery and audit trail
- Complexity-based auto-scaling (1 agent for typos, 7 for security-critical)
- Pain points: resume after stop broken, can't mix providers per role, agent hallucination
- banto should adopt: event-driven SQLite state, structured session completion, cost visibility, task acceptance criteria
- banto should avoid: multi-provider abstraction (CC-only is correct), over-engineered template DSL, TUI scope creep
