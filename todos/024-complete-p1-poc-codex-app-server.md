---
status: complete
priority: p1
issue_id: "024"
tags: [poc, validation, codex]
dependencies: []
---

# PoC: Codex App-Server

## Problem Statement

Assumptions B1-B6 in `.z/v2/validation/assumptions.md` are unverified. Codex `app-server` is undocumented — RPC method names, event shapes, and lifecycle behavior are unknown.

## Findings

N/A — to be filled during PoC execution.

## Proposed Solutions

1. **Source code reading**: Read Codex CLI source to discover app-server RPC interface
2. **Trial and error**: Spawn `codex app-server` and probe with JSON-RPC calls
3. **Combined**: Read source first, then validate with live test

**Recommended**: Option 3 — source reading reduces guesswork.

## Recommended Action

1. Check if `codex` CLI is installed (`which codex`)
2. If available, read Codex source/docs for `app-server` subcommand
3. Spawn `codex app-server` and send JSON-RPC `initialize`
4. Test `turn/start` with a simple prompt
5. Capture all RPC events (message, tool_use, approval, usage)
6. Test `thread/resume` if possible
7. Document RPC method signatures, event names, lifecycle

If Codex is not installed or `app-server` doesn't exist, document that finding.

Output: `.z/v2/validation/poc-codex-app-server.md`

## Acceptance Criteria

- [ ] `codex app-server` existence confirmed or denied
- [ ] RPC method names documented (or corrected from assumptions)
- [ ] Event payload shapes captured
- [ ] Lifecycle behavior documented (does it stay alive between turns?)
- [ ] Assumptions B1-B6 each marked verified/falsified/blocked
- [ ] Results written to `.z/v2/validation/poc-codex-app-server.md`

## Work Log

### 2026-03-08 - Created

**By:** Claude Code

**Actions:**
- Created todo from assumptions.md B1-B6
