---
status: complete
priority: p1
issue_id: "015"
tags: [competitor-research, oss, swift, libghostty, macos, notification-ux]
dependencies: []
---

# Deep Research: cmux

## Problem Statement

cmux (manaflow-ai/cmux) is a native macOS terminal app using libghostty for GPU-accelerated rendering. 4,361 stars. The notification ring system and OSC escape sequence integration for agent status are architecturally elegant UX patterns.

## Recommended Action

Conduct deep research covering:
- Architecture (Swift/AppKit, libghostty integration, Socket API for CLI automation)
- Notification ring system — how panes show blue rings when agents need attention
- Sidebar metadata: git branch, PR status, ports, latest notification per tab
- OSC escape sequences (9/99/777) for structured notifications from agents
- "Primitive, not a solution" philosophy — design decisions
- Layout persistence on relaunch (directories, scrollback)
- Socket API for external automation
- UX patterns transferable to web (banto)
- Learnings for banto

## Resources

- **Repository:** https://github.com/manaflow-ai/cmux

## Acceptance Criteria

- [x] Architecture documented
- [x] Notification ring UX pattern analyzed for web adaptation
- [x] OSC-based agent status communication evaluated
- [x] Sidebar metadata pattern documented
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/cmux.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

**Actions:**
- Discovered via GitHub-focused research
- Assigned p1 — UX patterns (notification rings, sidebar metadata) directly applicable to banto dashboard

### 2026-03-07 - Research Completed

**By:** Claude Code

**Actions:**
- Deep research completed via GitHub repo analysis
- Research saved to `.z/research/cmux.md`

**Key Learnings:**
- Notification rings: blue pane border glow + tab badge + sidebar text + macOS notification + dock badge. Web equivalent → animated card borders + favicon badges + Browser Notification API
- Sidebar metadata: git branch/dirty, PR status, TCP ports, working dir, notifications. Web equivalent → live-updating task cards via WebSocket
- OSC sequences unnecessary for banto — direct WebSocket events are more powerful
- cmux's gaps (task management, orchestration, review UI, multi-device) are exactly banto's differentiators
- "Primitive, not a solution" philosophy — cmux avoids prescribing workflows. banto takes the opposite approach: opinionated "jot, throw, watch"
- Known bug: notifications silently dropped when user is focused on generating workspace — banto must avoid this
