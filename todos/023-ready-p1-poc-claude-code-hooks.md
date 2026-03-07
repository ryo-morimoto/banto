---
status: ready
priority: p1
issue_id: "023"
tags: [poc, validation, claude-code]
dependencies: []
---

# PoC: Claude Code Hooks

## Problem Statement

Assumptions A1-A8 in `.z/v2/validation/assumptions.md` are unverified. CC hooks HTTP callback behavior, MCP permission prompt, and `--resume` flag need real-world validation.

## Findings

N/A — to be filled during PoC execution.

## Proposed Solutions

1. **Manual CLI test**: Run CC with `--hook-config` and a simple HTTP server, capture all hook events
2. **Scripted PoC**: Bun script that spawns CC, receives hooks, logs structured output

**Recommended**: Option 2 — reproducible and self-documenting.

## Recommended Action

Write a PoC script that:
1. Starts a local HTTP server to receive hook callbacks
2. Spawns `claude` with `--print` + `--hook-config` pointing to the local server
3. Sends a simple prompt ("Read README.md and list the files")
4. Captures all hook events (Notification, PreToolUse, PostToolUse, etc.)
5. Tests `--permission-prompt-tool` MCP integration
6. Tests `--resume` with the session ID from step 4
7. Documents: event types received, payload shapes, context_window presence

Output: `.z/v2/validation/poc-claude-code-hooks.md` with hypothesis, procedure, raw results, conclusions.

## Acceptance Criteria

- [ ] All 17 CC hook event types documented (which ones actually fire)
- [ ] Notification hook payload shape captured (session_id, context_window fields)
- [ ] PreToolUse/PostToolUse payload shape captured (tool_name, tool_input)
- [ ] MCP permission_prompt tested (approve/deny flow)
- [ ] `--resume` tested (session continuation)
- [ ] Assumptions A1-A8 each marked verified/falsified/partially verified
- [ ] Results written to `.z/v2/validation/poc-claude-code-hooks.md`

## Work Log

### 2026-03-08 - Created

**By:** Claude Code

**Actions:**
- Created todo from assumptions.md A1-A8
