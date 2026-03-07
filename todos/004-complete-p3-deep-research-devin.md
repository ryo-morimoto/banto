---
status: complete
priority: p3
issue_id: "004"
tags: [competitor-research, saas, cloud-agent, commercial]
dependencies: []
---

# Deep Research: Devin

## Problem Statement

Devin (Cognition AI) is the most well-funded cloud agent platform ($10.2B valuation). Need to understand what works, what doesn't, and user sentiment.

## Recommended Action

Conduct deep research covering:
- Architecture (cloud IDE, parallel instances, Devin Search/Wiki)
- Well-regarded features: interactive planning, task delegation
- Poorly-regarded features: pricing, accuracy, limitations
- Real developer evaluations and criticism
- Learnings for banto

## Resources

- **Website:** https://cognition.ai

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Real user evaluations collected
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/devin.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Complete

**By:** Claude Code

**Key findings:**

1. **Architecture**: Per-session Ubuntu 22.04 VMs with Brain (intelligence) / VM (execution) split. Stateless sessions, no cross-session memory. Enterprise VPC deployment available with Brain in Cognition tenant.

2. **Well-regarded**: Interactive Planning (plan-first before execution), parallel sessions, automated migrations (10-20x faster), security fix automation (20x), test coverage expansion (50% -> 90%), DeepWiki auto-documentation, Playbooks for recurring tasks, MCP marketplace.

3. **Poorly-regarded**: Unpredictable reliability (Answer.AI: 15% success rate on 20 tasks), looping/hallucination under failure, hidden supervision cost ("babysitting tax"), unpredictable ACU-based pricing, no cross-session memory ("amnesiac contractor"), overcomplexity in generated code, inability to handle ambiguous tasks, misleading early marketing that damaged trust.

4. **Top learnings for banto**:
   - Agent plan visibility before execution is the most valued UX feature
   - Cross-session memory is Devin's biggest gap and banto's differentiation opportunity
   - Optimize for fast human intervention, not full autonomy (the babysitting tax is real)
   - Local execution gives banto inherent cost predictability advantage
   - Task decomposition UX matters — agents succeed on 4-8hr junior-level bounded tasks
   - Playbooks/templates dramatically improve success rates for recurring work
