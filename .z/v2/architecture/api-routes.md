# API ルート

Elysia REST + WebSocket エンドポイント、リクエスト/レスポンス型、エラーコード。
上流: `../product/interaction-flows.md`、`data-model.md`

---

## 方針

- Eden Treaty でクライアント型を自動生成。手動で型を書かない。
- REST はリソース操作、WebSocket はリアルタイム push。
- 認証なし（H5: 単一ユーザー、Tailscale でアクセス制御）。
- エラーは HTTP ステータス + JSON body。

---

## REST エンドポイント

### Projects

| メソッド | パス | 説明 | リクエスト | レスポンス |
|---------|------|------|-----------|----------|
| GET | `/api/projects` | 一覧 | - | `Project[]` |
| POST | `/api/projects` | 作成 | `{ name, path }` | `Project` |
| PUT | `/api/projects/:id` | 更新 | `{ name?, path? }` | `Project` |
| DELETE | `/api/projects/:id` | 削除 | - | `204` |

**バリデーション (POST):**
- `name`: 必須、1-100 文字
- `path`: 必須、絶対パス、ディレクトリ存在確認、`.git` 存在確認

### Tasks

| メソッド | パス | 説明 | リクエスト | レスポンス |
|---------|------|------|-----------|----------|
| GET | `/api/tasks` | 一覧（ダッシュボード用） | `?status=active&projectId=xxx` | `TaskWithSession[]` |
| GET | `/api/tasks/:id` | 詳細 | - | `TaskDetail` |
| POST | `/api/tasks` | 作成 | `{ projectId, title, description? }` | `Task` |
| PUT | `/api/tasks/:id` | 更新 | `{ title?, description?, status?, pinned? }` | `Task` |
| DELETE | `/api/tasks/:id` | 削除 | - | `204` |

**TaskWithSession** (S1 ダッシュボード用):
```typescript
interface TaskWithSession {
  id: string;
  title: string;
  status: "backlog" | "active" | "done";
  pinned: boolean;
  projectId: string;
  projectName: string;
  // 最新セッション（あれば）
  session: {
    id: string;
    status: SessionStatus;
    agentProvider: string;
    startedAt: string | null;
    finishedAt: string | null;
    branch: string | null;
    contextPercent: number | null;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    diffSummary: DiffSummary | null;
    error: string | null;
  } | null;
}
```

**TaskDetail** (S2 タスク詳細用):
```typescript
interface TaskDetail {
  id: string;
  title: string;
  description: string | null;
  status: "backlog" | "active" | "done";
  pinned: boolean;
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  // 全セッション（新しい順）
  sessions: SessionSummary[];
}

interface SessionSummary {
  id: string;
  status: SessionStatus;
  agentProvider: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  branch: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  contextPercent: number | null;
  diffSummary: DiffSummary | null;
  agentSummary: string | null;
  error: string | null;
}
```

### Sessions (実行)

| メソッド | パス | 説明 | リクエスト | レスポンス |
|---------|------|------|-----------|----------|
| POST | `/api/tasks/:taskId/sessions` | 実行開始 | `{ agentProvider }` | `Session` |
| POST | `/api/sessions/:id/stop` | 実行停止 | - | `204` |
| POST | `/api/sessions/:id/resume` | Resume | - | `Session` |
| GET | `/api/sessions/:id` | 詳細 | - | `SessionDetail` |
| GET | `/api/sessions/:id/events` | イベント一覧 | `?since=seq` | `SessionEvent[]` |
| GET | `/api/sessions/:id/diff` | フル diff | - | `string` (unified diff) |

**POST /api/tasks/:taskId/sessions:**
- tasks.status が backlog なら自動で active に更新
- 同タスクにアクティブセッションがあれば 409 Conflict
- provider.check() で利用可能か確認
- sessions INSERT (pending) → provider.createSession() → session.start()

**POST /api/sessions/:id/resume:**
- capabilities.resume = true でなければ 400 Bad Request
- status が failed でなければ 409 Conflict

**GET /api/sessions/:id/events?since=seq:**
- `since` パラメータで差分取得。WebSocket 切断時のキャッチアップ用。

### Permissions

| メソッド | パス | 説明 | リクエスト | レスポンス |
|---------|------|------|-----------|----------|
| POST | `/api/sessions/:id/permissions/:requestId` | 権限応答 | `{ approved, remember? }` | `204` |

**remember オプション:**
```typescript
{ approved: true, remember: { tool: "Write", pattern: "src/**" } }
```
remember が指定された場合、auto_approve_rules に追加。

### Agents

| メソッド | パス | 説明 | リクエスト | レスポンス |
|---------|------|------|-----------|----------|
| GET | `/api/agents` | 利用可能エージェント一覧 | - | `AvailableProvider[]` |

S5 実行開始モーダルで使用。各プロバイダーの check() を実行して返す。

### Notifications

| メソッド | パス | 説明 | リクエスト | レスポンス |
|---------|------|------|-----------|----------|
| GET | `/api/notifications` | 未読一覧 | `?unreadOnly=true` | `Notification[]` |
| POST | `/api/notifications/:id/read` | 既読にする | - | `204` |
| POST | `/api/notifications/read-all` | 全既読 | - | `204` |

### Hooks (内部)

| メソッド | パス | 説明 | 送信元 |
|---------|------|------|-------|
| POST | `/api/hooks/claude-code` | CC hooks callback | Claude Code プロセス |

外部からのアクセスではない。Claude Code の hooks 設定で指定される内部エンドポイント。

---

## WebSocket エンドポイント

### メインチャネル

| パス | 方向 | フレーム | 内容 |
|------|------|---------|------|
| `/ws` | server→client | JSON text | session_event, status_changed, context_update, notification, notification_read, task_created, sync |
| `/ws` | client→server | JSON text | (将来: subscribe/unsubscribe) |

**接続時**: サーバーが sync メッセージを送信（全タスク最新状態 + 未読通知）。

### ターミナルチャネル

| パス | 方向 | フレーム | 内容 |
|------|------|---------|------|
| `/ws/terminal/:sessionId` | server→client | binary | PTY 出力バイト列 |
| `/ws/terminal/:sessionId` | client→server | binary | ユーザー入力バイト列 |
| `/ws/terminal/:sessionId` | client→server | JSON text | `{ type: "resize", cols, rows }` |

**接続時**: ring buffer の内容を replay（再接続対応）。
**切断時**: ターミナルストリームの WebSocket relay を一時停止（ring buffer への書き込みは継続）。

---

## エラーレスポンス

```typescript
interface ErrorResponse {
  error: string;    // マシンリーダブルコード
  message: string;  // 人間向けメッセージ
}
```

| HTTP | error | 状況 |
|------|-------|------|
| 400 | `VALIDATION_ERROR` | バリデーション失敗 |
| 400 | `RESUME_NOT_SUPPORTED` | resume 非対応エージェント |
| 404 | `NOT_FOUND` | リソースが存在しない |
| 409 | `ACTIVE_SESSION_EXISTS` | タスクに既にアクティブな実行がある |
| 409 | `INVALID_STATUS` | 現在のステータスでは実行できない操作 |
| 500 | `SPAWN_FAILED` | エージェントプロセスの起動失敗 |
| 500 | `INTERNAL_ERROR` | その他内部エラー |

---

## Elysia ルーティング構造

```typescript
// src/server/app.ts
const app = new Elysia()
  .use(projectRoutes)    // /api/projects
  .use(taskRoutes)       // /api/tasks
  .use(sessionRoutes)    // /api/sessions, /api/tasks/:taskId/sessions
  .use(agentRoutes)      // /api/agents
  .use(notificationRoutes) // /api/notifications
  .use(hookRoutes)       // /api/hooks
  .use(wsRoutes)         // /ws, /ws/terminal/:sessionId
```

各ドメインのルートファイルは `src/server/<domain>/routes.ts` に配置。
