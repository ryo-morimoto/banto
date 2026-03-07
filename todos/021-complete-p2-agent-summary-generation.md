---
status: complete
priority: p2
issue_id: "021"
tags: [architecture, data-model, sessions]
dependencies: []
---

# sessions.agent_summary generation is undefined

## Problem Statement

`sessions.agent_summary` column exists in data-model.md and is referenced in `dual-mode-ui.md` Summary section, but no architecture doc defines how or when it's generated. `diff_summary` has clear documentation (`SessionRunner.onExit()` + `git diff --stat`), but `agent_summary` has none.

## Findings

- `data-model.md`: Column defined, no generation logic
- `dual-mode-ui.md` line 84: `agent_summary | session.agent_summary` in Summary section (displayed when session is done)
- `event-system.md` `onExit()`: Only generates notifications, no summary extraction
- Possible sources: agent's final message, LLM summarization of session events, or agent-specific protocol field

## Proposed Solutions

### Option A: Extract from agent's last message

Parse the final `message` event (role: "assistant") as the summary. Simple but may not be concise.

### Option B: Agent protocol field

Some agents (CC `--print` mode, ACP) may return a summary in their completion response. Use it if available, null otherwise.

### Option C: LLM summarization

After session completes, send session events to an LLM to generate a 1-2 sentence summary. Higher quality but adds cost and latency.

### Option D: Skip for v1

Leave `agent_summary` nullable. Display `diff_summary` only. Add summarization later.

## Recommended Action

(To be filled during triage)

## Acceptance Criteria

- [ ] `agent_summary` generation timing and method is documented in architecture docs
- [ ] `SessionRunner.onExit()` or equivalent handles summary generation
- [ ] Nullable handling is defined for agents that don't provide summaries

## Work Log

### 2026-03-08 - Initial finding from data-model.md review

**By:** Claude Code

**Actions:**
- Searched all architecture docs for agent_summary references
- Found display in dual-mode-ui.md but no generation logic anywhere
