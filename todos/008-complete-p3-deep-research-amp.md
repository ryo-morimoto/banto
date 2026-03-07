---
status: complete
priority: p3
issue_id: "008"
tags: [competitor-research, cross-device, commercial, sourcegraph]
dependencies: []
---

# Deep Research: Amp (Sourcegraph)

## Problem Statement

Amp (Sourcegraph) uses server-stored threads for cross-device continuity. Relevant for banto's "watch from anywhere" vision.

## Recommended Action

Conduct deep research covering:
- Architecture (CLI + IDE + Web, server-stored threads)
- Well-regarded features: cross-device continuity, team visibility, sub-agents
- Poorly-regarded features / pain points
- User feedback
- Learnings for banto (especially cross-device implementation)

## Resources

- **Website:** https://ampcode.com

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/amp.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Complete

**By:** Claude Code

**Key Findings:**

- **Architecture**: Client-server model. CLI/IDE clients send context to Amp Server (GCP/PostgreSQL), which proxies to LLM providers (Anthropic, OpenAI, xAI, Google, Amazon). Threads stored server-side as the unit of cross-device continuity. Amp is killing its editor extension to focus on CLI + web.
- **Well-regarded**: Cross-device thread sync (most praised), sub-agent parallelism, multi-model strategy (Claude/GPT/Gemini), unconstrained token usage, CLI-first design, team workspace visibility, agentic code review, Sourcegraph-quality context management.
- **Poorly-regarded**: Usage-based pricing anxiety (>$1000/mo per dev on teams), no local-first thread storage option (privacy concern), free tier requires data training, sub-agents are fully isolated (no progress visibility, no mid-task guidance), leaderboards seen as misguided, thread stability issues, frontend polish gaps.
- **Corporate**: Spun out of Sourcegraph as Amp Inc. (Dec 2025). Already profitable. Quinn Slack as CEO. Backed by Sequoia, a16z, etc.
- **Top learnings for banto**: (1) Thread/session as atomic unit of cross-device is validated. (2) banto's local-first storage is a genuine differentiator vs Amp's cloud-only model. (3) Sub-agent progress visibility (not just final summary) aligns with banto's "watch" principle. (4) CLI + web (dropping IDE) trend validates banto's web dashboard + spawned agent architecture.
