---
status: complete
priority: p3
issue_id: "022"
tags: [architecture, data-model, conventions]
dependencies: []
---

# UTC convention for datetime columns is undocumented

## Problem Statement

All `datetime('now')` defaults in SQLite return UTC, but this isn't documented in data-model.md. Frontend display and any time-based logic needs to know the timezone convention.

## Proposed Solutions

### Option A: Add a one-line note to data-model.md

Add under WAL mode settings or as a new "Conventions" section:
> All `TEXT` datetime columns store ISO 8601 UTC (`datetime('now')` returns UTC). Client converts to local time for display.

## Acceptance Criteria

- [ ] UTC convention documented in data-model.md
- [ ] Client-side timezone conversion approach noted

## Work Log

### 2026-03-08 - Initial finding from data-model.md review

**By:** Claude Code
