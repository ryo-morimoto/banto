---
status: complete
priority: p1
issue_id: "013"
tags: [competitor-research, oss, docker, nats, sqlite, react, nix]
dependencies: []
---

# Deep Research: Praktor

## Problem Statement

Praktor (mtzanidakis/praktor) is architecturally the closest match to banto's vision despite only 8 stars. Go gateway + embedded NATS + Docker containers + SQLite + React Mission Control UI. Also uses Nix in containers. Need deep code-level investigation.

## Recommended Action

Conduct deep research covering:
- Architecture (Go gateway, embedded NATS message broker, Docker container isolation, SQLite persistence, React Mission Control UI)
- Real-time pattern: NATS vs polling vs WebSocket — how does it compare?
- Container isolation: Docker per-agent with per-agent memory databases
- Hot config reload and lazy container recreation
- Encrypted vault (AES-256-GCM) for secrets
- Agent swarm patterns (fan-out, pipeline, collaborative) with visual graph editor
- Telegram as primary I/O — what works, what doesn't
- Nix package manager integration in containers
- Code quality and architecture patterns
- Learnings for banto (especially NATS, Docker isolation, React dashboard)

## Resources

- **Repository:** https://github.com/mtzanidakis/praktor

## Acceptance Criteria

- [x] Architecture documented at code level (data flow, key abstractions)
- [x] NATS real-time pattern evaluated vs banto's WebSocket approach
- [x] Docker isolation pattern evaluated vs banto's nixos-container approach
- [x] React Mission Control UI patterns documented
- [x] Learnings for banto summarized
- [x] Research written to `.z/research/praktor.md`

## Work Log

### 2026-03-07 - Task Created

**By:** Claude Code

**Actions:**
- Discovered via GitHub-focused research (not in marketing-biased first search)
- Identified as architecturally closest to banto: NATS + Docker + SQLite + React + Nix
- Assigned p1 priority despite low star count — architecture quality over popularity

### 2026-03-07 - Research Completed

**By:** Claude Code

**Actions:**
- Deep research completed via GitHub repo analysis
- Research saved to `.z/research/praktor.md`

**Key Learnings:**
- NATS is used for gateway-to-container IPC only, browser connects via standard WebSocket (gateway bridges)
- Per-agent persistent memory (`memory.db` per container with MCP tools) — high priority pattern for banto
- Compositional system prompt assembly — high priority pattern
- Secret vault with `secret:name` references, resolved at container start, never exposed to LLM
- Lazy container startup + idle reaping — good for session management
- banto should use Unix domain sockets instead of NATS for nixos-containers
- NOT to adopt: Telegram as primary I/O, Docker (nixos-containers better), inline styles, manual fetch state
- Zero real community Issues (all 19 are Dependabot) — no user pain point data available
