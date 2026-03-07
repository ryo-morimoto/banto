---
status: complete
priority: p2
issue_id: "009"
tags: [competitor-research, web-dashboard, cross-device, self-hosted]
dependencies: []
---

# Deep Research: Marc Nuri's AI Coding Agent Dashboard

## Problem Statement

Marc Nuri's Dashboard is a cross-device web dashboard with hook/enricher architecture. Closest to banto's "watch" aspect.

## Recommended Action

Conduct deep research covering:
- Architecture (hook/enricher pattern, web dashboard design)
- Well-regarded features: agent-agnostic, cross-device, session cards with rich metadata
- Design philosophy and patterns
- Learnings for banto

## Resources

- **Blog post:** https://blog.marcnuri.com/ai-coding-agent-dashboard

## Acceptance Criteria

- [x] Architecture documented
- [x] Design patterns identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/marc-nuri-dashboard.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

- Fetched and analyzed the blog post at blog.marcnuri.com/ai-coding-agent-dashboard (2026-02-23)
- Searched for GitHub repository (not yet open-sourced)
- Searched HN, Reddit, X for community reactions (no major discussion threads found)
- Reviewed related blog posts (2025 Year in Review, Boosting Productivity with AI)
- Wrote comprehensive research to `.z/research/marc-nuri-dashboard.md`
- Key findings: hook/enricher pattern for agent-agnostic design, heartbeat protocol with stale detection, context percentage as killer metric, WebSocket terminal relay, cross-device session launch
- 8 learnings for banto documented
