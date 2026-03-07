---
status: complete
priority: p1
issue_id: "025"
tags: [poc, validation, acp]
dependencies: []
---

# PoC: ACP Connection

## Problem Statement

Assumptions C1-C6 in `.z/v2/validation/assumptions.md` are unverified. ACP (Agent Client Protocol) is Zed-originated and may not have testable agents available yet.

## Findings

N/A — to be filled during PoC execution.

## Proposed Solutions

1. **Research-only**: Check ACP spec, find compatible agents, document availability
2. **Live test**: Find an ACP agent, connect via JSON-RPC over stdio, run a prompt
3. **Mock server**: Build a minimal ACP-compatible mock to validate client code

**Recommended**: Option 1 first (assess feasibility), then Option 2 if an agent exists.

## Recommended Action

1. Research current ACP spec status (GitHub, Zed blog, npm packages)
2. Identify any ACP-compatible agents that can be installed
3. If an agent exists:
   - Spawn it and send `initialize` JSON-RPC
   - Send a prompt via `turn/start` or equivalent
   - Capture events and capability negotiation
4. If no agent exists, document the gap and implications for banto's "universal fallback" strategy
5. Assess whether ACP should remain in v1 scope or be deferred

Output: `.z/v2/validation/poc-acp-connection.md`

## Acceptance Criteria

- [ ] ACP spec current status documented
- [ ] Available ACP-compatible agents listed (or "none found")
- [ ] If testable: initialize + capability negotiation captured
- [ ] If testable: event method names validated against C3
- [ ] Assumptions C1-C6 each marked verified/falsified/blocked/deferred
- [ ] Results written to `.z/v2/validation/poc-acp-connection.md`

## Work Log

### 2026-03-08 - Created

**By:** Claude Code

**Actions:**
- Created todo from assumptions.md C1-C6
