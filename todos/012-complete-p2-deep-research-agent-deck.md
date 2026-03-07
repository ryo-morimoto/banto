---
status: complete
priority: p2
issue_id: "012"
tags: [competitor-research, tui, tmux, oss]
dependencies: []
---

# Deep Research: Agent Deck

## Problem Statement

Agent Deck (asheshgoplani/agent-deck) is an AI-aware tmux layer with smart status detection and session forking. Interesting patterns worth studying.

## Recommended Action

Conduct deep research covering:
- Architecture (TUI, smart status detection mechanism)
- Well-regarded features: session forking with context inheritance, MCP management, global search
- Poorly-regarded features / pain points
- User feedback
- Learnings for banto

## Resources

- **Repository:** https://github.com/asheshgoplani/agent-deck

## Acceptance Criteria

- [x] Architecture documented
- [x] Well-regarded and poorly-regarded features identified
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/agent-deck.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

### 2026-03-07 - Research Completed

**By:** Claude Code

Conducted deep research on Agent Deck (asheshgoplani/agent-deck). Gathered information from GitHub README, source code structure (go.mod), TUI/CLI reference docs, troubleshooting guide, changelog, GitHub issues (18 open), HN discussion (Agent Hand thread), and official documentation site. No significant Reddit/Twitter discussion found.

Key findings:
- Go + Bubble Tea TUI on tmux, 4-state status detection via PTY pattern matching
- Standout features: session forking with context inheritance, MCP socket pooling (85-90% memory reduction), conductor orchestration, global search across Claude conversations
- Pain points: early stability issues (black screen on Ctrl+Q), tmux kill-server destroys everything, feature scope creep (22 versions in 3 months), no mouse support initially
- 10 learnings documented for banto, most important: task-centric model inherently addresses the coordination gap that status-only tools leave open

Research written to `.z/research/agent-deck.md`.
