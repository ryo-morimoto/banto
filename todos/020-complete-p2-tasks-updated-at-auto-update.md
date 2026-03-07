---
status: complete
priority: p2
issue_id: "020"
tags: [architecture, data-model, sqlite]
dependencies: []
---

# tasks.updated_at has no auto-update mechanism

## Problem Statement

`tasks.updated_at` has `DEFAULT (datetime('now'))` for INSERT, but no mechanism to update it on subsequent UPDATEs. S1 dashboard query sorts by `t.updated_at DESC`, so stale values break sort order.

## Findings

SQLite doesn't auto-update columns on UPDATE like MySQL's `ON UPDATE CURRENT_TIMESTAMP`. Two options exist:

1. **Application layer**: Every UPDATE query must include `updated_at = datetime('now')`
2. **SQL trigger**: `CREATE TRIGGER` on tasks table

## Proposed Solutions

### Option A: Application layer (convention)

Repository's `update()` method always includes `updated_at`:
```typescript
update(id: TaskId, data: Partial<Task>) {
  data.updated_at = new Date().toISOString();
  // ... build SET clause
}
```

**Pros:** Simple. No hidden DB behavior.
**Cons:** Easy to forget. Requires discipline.

### Option B: SQLite trigger

```sql
CREATE TRIGGER trg_tasks_updated_at
  AFTER UPDATE ON tasks
  FOR EACH ROW
BEGIN
  UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

**Pros:** Can't forget. Works regardless of code path.
**Cons:** Hidden behavior. Slightly more complex migration.

## Recommended Action

(To be filled during triage)

## Acceptance Criteria

- [ ] `tasks.updated_at` is updated on every task modification
- [ ] S1 dashboard sort order reflects actual update time
- [ ] Chosen mechanism is documented in data-model.md

## Work Log

### 2026-03-08 - Initial finding from data-model.md review

**By:** Claude Code

**Actions:**
- Identified missing auto-update for tasks.updated_at
- Confirmed S1 query depends on updated_at for sort order
