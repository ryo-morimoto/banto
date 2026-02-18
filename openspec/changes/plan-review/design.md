# Design: Plan Review Feature

## Context

banto sessions spawn `claude` CLI in a git worktree. When Claude Code enters plan mode, it creates a `.md` file in a plans directory. Currently there is no way to comfortably review these plans — they are only visible as terminal output.

Goal: GitHub-like review UX where users can read the plan, select lines, leave inline comments, and submit structured feedback back to Claude.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ runner.ts                                                       │
│  spawn claude --settings '{"plansDirectory":"..."}' prompt      │
│                                                                 │
│  PlanWatcher (fs.watch)                                         │
│    detect .md create/change → read content → save to DB         │
│    → notify client via polling                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Client: TaskDetailPage                                          │
│  [Terminal] [Plan ●]    ← tab bar                               │
│                                                                 │
│  PlanReviewView                                                 │
│    line-numbered source + inline comments + submit review       │
└─────────────────────────────────────────────────────────────────┘
```

## 1. Plan Detection

### Mechanism: `--settings` CLI flag + `fs.watch`

When spawning the `claude` process, inject `plansDirectory` via CLI argument:

```ts
// runner.ts
const plansDir = join(wtPath, ".banto", "plans");
mkdirSync(plansDir, { recursive: true });

Bun.spawn([
  "claude",
  "--settings", JSON.stringify({ plansDirectory: plansDir }),
  prompt,
], {
  cwd: wtPath,
  // ...
});
```

Then watch the directory:

```ts
// plans/watcher.ts
fs.watch(plansDir, (event, filename) => {
  if (filename?.endsWith(".md")) {
    const content = readFileSync(join(plansDir, filename), "utf-8");
    planRepo.upsert(taskId, filename, content);
  }
});
```

**Why `.banto/plans/` instead of `.claude/plans/`:**
- Avoids collision with Claude Code's own `.claude/` config
- Makes it clear these are banto-managed artifacts
- `.banto/` already used for attachments in the worktree

**Why `--settings` inline JSON:**
- No need to write `.claude/settings.json` into the worktree
- Session-scoped — no side effects on the project
- Avoids the known bug where project-level `plansDirectory` is ignored (#19537)

### Watcher lifecycle

- **Start**: When `spawnPty` creates the worktree, start watching `{wtPath}/.banto/plans/`
- **Stop**: When session ends (process exit) or `archiveSession` is called
- **Debounce**: Claude edits plans incrementally — debounce file change events (500ms)

## 2. Plan Storage

### DB Schema

```sql
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_plans_task_id ON plans(task_id);
```

- One plan per task at a time (Claude overwrites the same file within a session)
- `content` is the full markdown text — small enough for TEXT column
- On file change: `UPSERT` by (task_id, filename)

### Persistence across session archive

When `archiveSession` deletes the worktree, plans remain in the DB. Users can review past plans from the task detail view.

## 3. API

### REST endpoints

```
GET  /api/tasks/:taskId/plans          → Plan[]
GET  /api/tasks/:taskId/plans/:planId  → Plan (with content)
```

### Polling

Client polls `GET /api/tasks/:taskId/plans` while session is active (2-3s interval). Sufficient because plan edits are infrequent.

Future optimization: dedicated WebSocket channel for plan events.

## 4. Plan Review UX

### Layout: Tab in main area

```
┌──────────────┬────────────────────────────────────────────┐
│ TaskInfoPanel │ [Terminal] [Plan ●]                        │
│              ├────────────────────────────────────────────┤
│              │                                            │
│  (w-80)      │  Main area (flex-1)                       │
│              │  Shows TerminalView or PlanReviewView      │
│              │                                            │
└──────────────┴────────────────────────────────────────────┘
```

- `Plan` tab appears when a plan is detected
- `●` indicator when plan has unread updates
- Auto-switch to Plan tab on first detection

### PlanReviewView: GitHub-style source review

```
┌────────────────────────────────────────────────────────┐
│  plan-file.md                          Updated 3s ago  │
├────┬───────────────────────────────────────────────────┤
│    │                                                   │
│  1 │ # Authentication Refactoring Plan                 │
│  2 │                                                   │
│  3 │ ## Overview                                       │
│  4 │ Refactor the auth module to support OAuth2...     │
│  5 │ This involves changes to three main areas:        │
│  6 │                                                   │
│  + │ ┌─────────────────────────────────────────────┐   │
│    │ │ This should also cover refresh tokens.      │   │
│    │ │                              [Add comment]  │   │
│    │ └─────────────────────────────────────────────┘   │
│  7 │ ## Approach                                       │
│  8 │ 1. Extract token management into TokenService     │
│  9 │ 2. Add OAuth2 provider abstraction                │
│ 10 │ 3. Update middleware to use new service            │
│    │                                                   │
│    │  💬 user (pending)                                │
│    │  ┌─────────────────────────────────────────────┐  │
│    │  │ Steps 2 and 3 should be swapped — we need  │  │
│    │  │ middleware changes before the abstraction.  │  │
│    │  └─────────────────────────────────────────────┘  │
│ 11 │                                                   │
│ 12 │ ## Steps                                          │
│    │ ...                                               │
├────┴───────────────────────────────────────────────────┤
│  2 pending comments                                    │
│                     [Request Changes ▾] [Approve]      │
└────────────────────────────────────────────────────────┘
```

### Interaction details

**Line selection:**
- Hover over gutter → `+` icon appears (like GitHub)
- Click `+` → comment form opens below that line
- Click line number + shift-click another → range selection, comment form covers the range
- Selected lines get a highlight background

**Comment form:**
- Textarea with placeholder "Leave a comment..."
- `Add comment` button (or Ctrl+Enter) → saves as pending comment
- `Cancel` to discard
- Pending comments shown inline with a "pending" badge

**Submit review (action bar at bottom):**
- Shows count of pending comments
- Two actions:
  - **Approve**: sends approval to terminal stdin, switches to Terminal tab
  - **Request Changes**: sends formatted feedback to terminal stdin

**Formatted feedback sent to stdin:**

```
I've reviewed the plan and have the following feedback:

Lines 3-6:
> ## Overview
> Refactor the auth module to support OAuth2...
> This involves changes to three main areas:

This should also cover refresh tokens.

---

Lines 8-10:
> 1. Extract token management into TokenService
> 2. Add OAuth2 provider abstraction
> 3. Update middleware to use new service

Steps 2 and 3 should be swapped — we need middleware changes before the abstraction.

---

Please revise the plan based on the above feedback.
```

### State management

```ts
interface ReviewComment {
  id: string;
  startLine: number;
  endLine: number;
  body: string;
}

// Component state (not persisted to DB)
// Comments live only during the review session
// On submit: formatted and sent to stdin, then cleared
```

Review comments are ephemeral — they exist only in React state during the review. Once submitted, they are formatted into text and sent to the terminal. No need to persist comments in the DB (the plan itself gets updated by Claude in response).

### Edge cases

- **Plan updated while reviewing**: Re-render source, preserve pending comments if line ranges still valid. Show "Plan updated — some comments may be outdated" warning if line count changed significantly.
- **Session ends while reviewing**: Action bar changes to "Session ended" — no approve/request changes. Comments are discarded (plan is already in DB for future reference).
- **Multiple plan files**: Show the most recently updated one. Rare case — Claude typically uses one plan per session.

## 5. Implementation scope

### Server

```
src/server/
  plans/
    repository.ts    -- plans table CRUD (upsert, findByTaskId)
    watcher.ts       -- fs.watch wrapper with debounce
    routes.ts        -- GET /api/tasks/:taskId/plans
  sessions/
    runner.ts        -- add --settings flag, start/stop watcher
  db.ts              -- add plans table migration
```

### Client

```
src/client/
  plans/
    PlanReviewView.tsx       -- main review container
    PlanSourceView.tsx       -- line-numbered source display
    ReviewCommentForm.tsx    -- inline comment input
    ReviewComment.tsx        -- pending comment display
    ReviewActionBar.tsx      -- submit review bar
    queries.ts               -- useQuery for plan polling
    api.ts                   -- Eden treaty client
  routes/
    task.tsx                 -- add tab bar, integrate PlanReviewView
```

### Dependencies

No new external dependencies required:
- Markdown source rendering: plain `<pre>` with line numbers (no library needed)
- Syntax highlighting for md source: optional, can use CSS-only approach or add later

## 6. Decisions & trade-offs

| Decision | Rationale |
|----------|-----------|
| Show markdown source (not rendered) | Line-level addressing requires stable line numbers. Rendered HTML has no 1:1 line mapping. |
| REST polling (not WebSocket) | Plan changes are infrequent. Polling every 2-3s is simple and sufficient. |
| Ephemeral comments (not persisted) | Comments are feedback to Claude, not a permanent record. The plan itself is the artifact. |
| `--settings` inline JSON | Cleanest injection method. No filesystem side effects. |
| `.banto/plans/` directory | Clear ownership. Avoids `.claude/` config collision. |
| Single plan per task | Matches Claude Code behavior (overwrites within session). Simplifies UI. |
