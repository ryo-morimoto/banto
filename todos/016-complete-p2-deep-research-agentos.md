---
status: complete
priority: p2
issue_id: "016"
tags: [competitor-research, oss, nextjs, mobile-first, pwa, web-dashboard]
dependencies: []
---

# Deep Research: AgentOS

## Problem Statement

AgentOS (saadnvd1/agent-os) is the closest conceptual match to banto — mobile-first web UI for multi-agent sessions with tmux backend. 93 stars. Validates banto's PWA approach.

## Recommended Action

Conduct deep research covering:
- Architecture (Next.js, tmux backend, Tauri desktop wrapper)
- Mobile-first web UI design patterns
- Voice-to-text prompting implementation
- Tailscale for remote access
- File upload from phone
- Conductor/worker model via MCP for orchestration
- Up to 4 sessions side-by-side layout
- Git worktree isolation
- Learnings for banto (especially mobile-first web dashboard)

## Resources

- **Repository:** https://github.com/saadnvd1/agent-os

## Acceptance Criteria

- [x] Architecture documented
- [x] Mobile-first UI patterns analyzed
- [x] Remote access approach evaluated
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/agentos.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

Conducted deep research on saadnvd1/agent-os covering:
- Architecture: Next.js + tmux + xterm.js + better-sqlite3 + Tauri desktop wrapper
- Mobile-first UI: voice-to-text, file upload from phone, full-screen mobile view
- Remote access: Tailscale VPN recommended approach
- Conductor/worker MCP orchestration for multi-agent coordination
- Git worktree isolation (available but not default per issue #15)
- 10 learnings for banto including: Tailscale as remote access pattern, push notifications as differentiator, mobile-first is hard to get right, voice input as legitimate UX pattern

Key finding: AgentOS validates banto's PWA approach but its critical mobile bugs (keyboard hiding UI on Android Chrome) show that mobile-first requires continuous real-device testing. Push notifications (absent in AgentOS, loved in Happy Coder) should be core for banto's "jot, throw, watch" workflow.

Research written to `.z/research/agentos.md`.
