# データモデル

SQLite スキーマ、インデックス、マイグレーション、制約。
上流: `../product/information-architecture.md` のエンティティ属性を実装レベルに落とす。

---

## TypeScript 型定義（SQL CHECK 制約の source of truth）

SQL の CHECK 制約と 1:1 対応する TypeScript 型。
branded types は `agent-provider-interface.md` で定義。

```typescript
// DB enum → TypeScript union literals
type TaskStatus = "backlog" | "active" | "done";
type SessionStatus = "pending" | "running" | "waiting_permission" | "done" | "failed";
type SessionEventType =
  | "status_changed" | "message" | "tool_use" | "tool_result"
  | "permission_request" | "permission_response"
  | "error" | "cost_update" | "context_update";
type NotificationType =
  | "permission_required" | "session_done" | "session_failed"
  | "context_warning" | "session_recovered" | "session_orphaned";
type NotificationPriority = "critical" | "high" | "normal";

// EventSource, Confidence は agent-provider-interface.md で定義済み
```

---

## スキーマ

### projects

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**制約:**
- `path` は UNIQUE。同一リポジトリの重複登録を防止。
- `id` は ULID（時刻ソート可能 + ランダム）。
- TypeScript 側では `ProjectId` branded type。

### tasks

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'active', 'done')),
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_project_id ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
```

**status 遷移（アプリケーション層で強制）:**
```
backlog -> active（実行開始時に自動）
active -> done（ユーザーが手動で完了）
active -> backlog（ユーザーが手動で戻す）
done -> active（再度作業する場合）
```

- TypeScript 側: `id` → `TaskId`, `project_id` → `ProjectId`, `status` → `TaskStatus`

### sessions

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent_provider TEXT NOT NULL,
  agent_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'waiting_permission', 'done', 'failed')),
  status_confidence TEXT NOT NULL DEFAULT 'high'
    CHECK (status_confidence IN ('high', 'medium', 'low')),

  -- Context & Summary（product/information-architecture.md で追加）
  context_percent INTEGER CHECK (context_percent BETWEEN 0 AND 100),
  agent_summary TEXT,
  diff_summary TEXT,  -- JSON: DiffSummary

  -- Timestamps
  started_at TEXT,
  finished_at TEXT,

  -- Result
  exit_code INTEGER,
  error TEXT,

  -- Infrastructure
  instance_id TEXT,
  worktree_path TEXT,
  branch TEXT,

  -- Cost tracking
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,

  -- Terminal persistence
  scrollback_path TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sessions_task_id ON sessions(task_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_instance_id ON sessions(instance_id);
```

**status 遷移（SessionRunner が管理）:**
```
pending -> running       (start() 成功)
running -> waiting_permission  (permission_request イベント)
waiting_permission -> running  (permission_response)
running -> done          (exit code 0)
running -> failed        (exit code != 0 or エラー)
pending -> failed        (spawn 失敗)
```

- TypeScript 側: `id` → `SessionId`, `task_id` → `TaskId`, `agent_provider` → `ProviderId`, `status` → `SessionStatus`, `status_confidence` → `Confidence`

**同時実行制約:**
1 タスクにつきアクティブセッション（status IN ('pending', 'running', 'waiting_permission')）は最大 1。
アプリケーション層で強制。DB 制約では表現しない（部分ユニークインデックスが SQLite で不安定）。

```typescript
// SessionService.createSession() 内で:
const active = db.query(
  `SELECT 1 FROM sessions
   WHERE task_id = ? AND status IN ('pending', 'running', 'waiting_permission')
   LIMIT 1`
).get(taskId);
if (active) throw new Error("Task already has an active execution");
```

### session_events

```sql
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN (
      'status_changed', 'message', 'tool_use', 'tool_result',
      'permission_request', 'permission_response',
      'error', 'cost_update', 'context_update'
    )),
  source TEXT NOT NULL
    CHECK (source IN ('hook', 'protocol', 'mcp', 'process', 'heuristic', 'user', 'auto')),
  confidence TEXT NOT NULL DEFAULT 'high'
    CHECK (confidence IN ('high', 'medium', 'low')),
  payload TEXT NOT NULL,  -- JSON
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(session_id, seq)
);

CREATE INDEX idx_session_events_session_id ON session_events(session_id);
```

**Append-only**: INSERT のみ。UPDATE / DELETE はしない。
**seq**: セッション内の単調増加連番。SessionRunner がインメモリカウンタで管理。

- TypeScript 側: `session_id` → `SessionId`, `type` → `SessionEventType`, `source` → `EventSource`, `confidence` → `Confidence`

### notifications

```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  type TEXT NOT NULL
    CHECK (type IN (
      'permission_required', 'session_done', 'session_failed',
      'context_warning', 'session_recovered', 'session_orphaned'
    )),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('critical', 'high', 'normal')),
  title TEXT NOT NULL,
  body TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_session_id ON notifications(session_id);
```

**永続化必須**: cmux Issue #963 の教訓。transient notification は許容しない。

- TypeScript 側: `session_id` → `SessionId | null`, `type` → `NotificationType`, `priority` → `NotificationPriority`

### server_state

```sql
CREATE TABLE server_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

**使用する key:**

| key | 値 | 用途 |
|-----|-----|------|
| instance_id | UUID | クラッシュ復旧時の孤立セッション検出 |

---

## WAL モード設定

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

- WAL: 読み書き並行。WebSocket push 用のクエリが書き込みをブロックしない。
- synchronous = NORMAL: WAL モードでは十分な耐久性。
- busy_timeout: 5 秒。単一ユーザーなので衝突は稀だが安全弁。

---

## マイグレーション

bun:sqlite にはマイグレーションフレームワークがないため、自前で管理する。

```sql
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**方式:**
- `src/server/db/migrations/` に `001_initial.sql`, `002_xxx.sql` ... を配置
- サーバー起動時に未適用のマイグレーションを順に実行
- トランザクション内で SQL 実行 + migrations テーブル INSERT

```typescript
function runMigrations(db: Database) {
  const applied = db.query("SELECT id FROM migrations").all().map(r => r.id);
  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.id)) {
      db.transaction(() => {
        db.run(migration.sql);
        db.run("INSERT INTO migrations (id, name) VALUES (?, ?)", [migration.id, migration.name]);
      })();
    }
  }
}
```

---

## クエリパターン

### S1 ダッシュボード: タスク一覧

```sql
SELECT
  t.id, t.title, t.status, t.pinned, t.project_id,
  p.name AS project_name,
  s.id AS session_id,
  s.status AS session_status,
  s.agent_provider,
  s.started_at,
  s.finished_at,
  s.branch,
  s.context_percent,
  s.tokens_in, s.tokens_out, s.cost_usd,
  s.diff_summary,
  s.error
FROM tasks t
JOIN projects p ON t.project_id = p.id
LEFT JOIN sessions s ON s.id = (
  SELECT id FROM sessions
  WHERE task_id = t.id
  ORDER BY created_at DESC
  LIMIT 1
)
ORDER BY
  -- Needs Attention first
  CASE WHEN s.status IN ('waiting_permission', 'failed') THEN 0 ELSE 1 END,
  -- Pinned second
  t.pinned DESC,
  -- Then by project, then by update time
  p.name, t.updated_at DESC;
```

**注意**: 最新セッションの取得はサブクエリ。タスク数が数十程度なので性能問題はない。

### S2 タスク詳細: 実行履歴

```sql
SELECT
  s.id, s.status, s.agent_provider, s.started_at, s.finished_at,
  s.exit_code, s.branch, s.tokens_in, s.tokens_out, s.cost_usd,
  s.diff_summary, s.agent_summary, s.error
FROM sessions s
WHERE s.task_id = ?
ORDER BY s.created_at DESC;
```

### 孤立セッション検出（クラッシュ復旧）

```sql
SELECT s.id, s.task_id, s.agent_provider, s.agent_session_id
FROM sessions s
WHERE s.status IN ('running', 'waiting_permission')
  AND s.instance_id != ?;
```

### 未読通知数

```sql
SELECT COUNT(*) AS count FROM notifications WHERE read = 0;
```

---

## diff_summary JSON スキーマ

```typescript
type DiffSummary = {
  files: Array<{
    path: string;
    status: "M" | "A" | "D" | "R";  // Modified, Added, Deleted, Renamed
    additions: number;
    deletions: number;
  }>;
  total_additions: number;
  total_deletions: number;
};
```

**生成タイミング**: セッション完了時（exit code 0）に SessionRunner が `git diff --stat` を実行して保存。

```typescript
// SessionRunner.onExit() 内:
if (exitCode === 0 && session.branch) {
  const diffStat = await gitDiffStat(session.worktreePath ?? projectPath, session.branch);
  await sessionRepo.update(session.id, { diff_summary: JSON.stringify(diffStat) });
}
```
