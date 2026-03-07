---
status: complete
priority: p2
issue_id: "005"
tags: [competitor-research, oss, saas, self-hosted, agent-sdk]
dependencies: []
---

# Deep Research: OpenHands

## Problem Statement

OpenHands (All-Hands-AI, formerly OpenDevin) is the leading OSS + SaaS agent platform with Software Agent SDK. Relevant as a self-hosted competitor.

## Recommended Action

Conduct deep research covering:
- Architecture (CLI + TUI + Web, Kubernetes self-hosted, Agent SDK)
- Well-regarded features: SDK, CI/CD integrations, self-hosted option
- Poorly-regarded features / pain points
- User feedback
- Learnings for banto (especially self-hosted design)

## Resources

- **Website:** https://openhands.dev
- **Repository:** https://github.com/OpenHands/OpenHands

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/openhands.md`

## Work Log

### 2026-03-07 - Research Completed

**By:** Claude Code

- Researched OpenHands architecture (V0 to V1 evolution, SDK, Agent Server, deployment options)
- Identified 7 well-regarded features (SDK, model agnosticism, self-hosted, CI/CD, stability, sandbox isolation, event condensation)
- Identified 10 pain points (cost explosion, poor local model performance, no mid-task interruption, no cross-session memory, config complexity, Docker dependency, rate limiting, agent loops, non-localhost breakage, codebase degradation risk)
- Gathered user feedback from HN, Zenn, Medium, GitHub issues
- Summarized 10 learnings for banto
- Research written to `.z/research/openhands.md`

### 2026-03-07 - Task Created

**By:** Claude Code
