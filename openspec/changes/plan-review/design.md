# Design: Plan Review Feature

## Context

banto sessions spawn `claude` CLI in a git worktree. When Claude Code enters plan mode, it writes a plan file. Currently there is no way to comfortably review these plans — they are only visible as terminal output.

Goal: GitHub-like review UX where users can read the plan, select lines, leave inline comments, and submit structured feedback back to Claude.

## Prerequisite: Worktree lifecycle = Task lifecycle

Current implementation creates/destroys worktrees per session (`archiveSession` → `removeWorktree`). This is wrong. A task has exactly one worktree throughout its lifetime:

- **Task created → first session start**: worktree is created (if not exists)
- **Session archived**: worktree survives. Only session state is reset.
- **New session on same task**: reuses existing worktree as-is
- **Task completed/deleted**: worktree is removed

This change is a prerequisite. The plan feature depends on it.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ runner.ts                                                       │
│  spawn claude --settings '{"plansDirectory":"..."}' prompt      │
│                                                                 │
│  PlanWatcher (fs.watch)                                         │
│    detect plan file create/change → notify client via polling   │
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

A task has at most one plan. The plan file lives at a fixed path in the worktree:

```
{wtPath}/.banto/plans/plan.md
```

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

Then watch the directory for the plan file:

```ts
// plan/watcher.ts
fs.watch(plansDir, (event, filename) => {
  if (filename === "plan.md") {
    planRegistry.set(taskId, { plansDir, updatedAt: Date.now() });
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

- **Start**: When `spawnPty` starts a session, start watching `{wtPath}/.banto/plans/`
- **Stop**: When session ends (process exit) or `archiveSession` is called
- **Debounce**: Claude edits the plan incrementally — debounce file change events (500ms)

## 2. Plan Storage: Disk only (no DB)

A plan is a single file that lives in the task's worktree. Since the worktree persists for the task's entire lifetime, the plan naturally persists across sessions.

- **No session running**: Plan file may already exist from a previous session. API reads it from disk.
- **During session**: Claude may create or overwrite the plan file. Watcher detects changes.
- **Task deleted**: Worktree is removed, plan is gone.
- **No DB schema, no migration needed.**

### In-memory registry

The watcher maintains a lightweight in-memory map so the API knows which tasks have a plan and where to find it:

```ts
// Map<taskId, { plansDir: string, updatedAt: number }>
const planRegistry = new Map();
```

This is rebuilt on server restart by scanning worktrees for existing plan files.

## 3. API

### REST endpoint

```
GET  /api/tasks/:taskId/plan    → { content, updatedAt }
```

Single endpoint. Reads `{wtPath}/.banto/plans/plan.md` from disk. Returns 404 if the file does not exist or the task has no worktree.

No filename parameter — a task has exactly one plan at a fixed path.

### Polling

Client polls `GET /api/tasks/:taskId/plan` while session is active (2-3s interval). Sufficient because plan edits are infrequent.

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

- `Plan` tab appears when plan file exists (either from current or previous session)
- `●` indicator when plan has unread updates
- Auto-switch to Plan tab on first detection during active session

### PlanReviewView: GitHub-style source review

```
┌────────────────────────────────────────────────────────┐
│  plan.md                               Updated 3s ago  │
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

Review comments are ephemeral — they exist only in React state during the review. Once submitted, they are formatted into text and sent to the terminal. No persistence needed.

### Edge cases

- **Plan updated while reviewing**: Re-render source, preserve pending comments if line ranges still valid. Show "Plan updated — some comments may be outdated" warning if line count changed significantly.
- **Session ends while reviewing**: Action bar changes to "Session ended" — no approve/request changes. Comments are discarded.
- **No session but plan exists**: Plan tab is visible and readable (from previous session). Action bar is hidden since there is no active session to send feedback to.
- **New session overwrites plan**: Claude may overwrite the plan file in a new session. Treated the same as a plan update.

## 5. Implementation scope

### Server

```
src/server/
  plan/
    watcher.ts       -- fs.watch wrapper with debounce + in-memory registry
    routes.ts        -- GET /api/tasks/:taskId/plan (reads from disk)
  sessions/
    runner.ts        -- add --settings flag, start/stop watcher
    worktree.ts      -- decouple worktree lifecycle from session (prerequisite)
```

### Client

```
src/client/
  plan/
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
| Disk only, no DB | Plan is a file in the worktree. Worktree persists with the task — no separate persistence needed. |
| Worktree lifecycle = task lifecycle | Plan must survive across sessions. Worktree is the natural home for all task artifacts. |
| Singular plan per task | A task has one plan at a fixed path. No list/filename needed. Eliminates path traversal concerns. |
| REST polling (not WebSocket) | Plan changes are infrequent. Polling every 2-3s is simple and sufficient. |
| Ephemeral comments (not persisted) | Comments are feedback to Claude, not a permanent record. The plan itself is the artifact. |
| `--settings` inline JSON | Cleanest injection method. No filesystem side effects. |
| `.banto/plans/` directory | Clear ownership. Avoids `.claude/` config collision. |
