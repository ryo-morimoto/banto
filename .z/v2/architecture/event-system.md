# イベントシステム

イベントレジャーの設計、追記フロー、実体化、WebSocket でのクライアント push。
セッションの状態管理はすべてこのイベントシステムを経由する。

上流: `agent-provider-interface.md` (AgentEvent)、`data-model.md` (session_events テーブル)

---

## 全体フロー

```
AgentSession              SessionRunner             DB                WebSocket
  |                          |                      |                    |
  | emit("event", e)         |                      |                    |
  +------------------------->|                      |                    |
  |                          | seq = nextSeq()      |                    |
  |                          | session_events INSERT |                    |
  |                          +--------------------->|                    |
  |                          |                      |                    |
  |                          | materialize(e)       |                    |
  |                          | (sessions UPDATE)    |                    |
  |                          +--------------------->|                    |
  |                          |                      |                    |
  |                          | notify?(e)           |                    |
  |                          | (notifications INSERT)|                   |
  |                          +--------------------->|                    |
  |                          |                      |                    |
  |                          | WS broadcast(e)      |                    |
  |                          +--------------------------------------------->|
  |                          |                      |                    |
```

---

## イベントレジャー

### 追記フロー

SessionRunner がイベントを受け取ったとき:

```typescript
class SessionRunner {
  private seqCounters = new Map<string, number>();  // sessionId -> next seq

  private handleEvent(sessionId: string, event: AgentEvent) {
    const seq = this.nextSeq(sessionId);

    // 1. Append to ledger
    this.eventRepo.insert({
      session_id: sessionId,
      seq,
      type: event.type,
      source: event.source,
      confidence: event.confidence,
      payload: JSON.stringify(event.payload),
    });

    // 2. Materialize (update sessions table)
    this.materialize(sessionId, event);

    // 3. Generate notifications if needed
    this.maybeNotify(sessionId, event);

    // 4. Push to connected clients
    this.wsBroadcast(sessionId, { seq, ...event });
  }

  private nextSeq(sessionId: string): number {
    const current = this.seqCounters.get(sessionId) ?? 0;
    const next = current + 1;
    this.seqCounters.set(sessionId, next);
    return next;
  }
}
```

### seq の回復

サーバー再起動時、アクティブセッションの seq カウンタを DB から復元:

```sql
SELECT session_id, MAX(seq) AS max_seq
FROM session_events
WHERE session_id IN (
  SELECT id FROM sessions WHERE status IN ('running', 'waiting_permission')
)
GROUP BY session_id;
```

---

## 実体化（Materialize）

イベントに基づいて sessions テーブルの属性を更新する。

| イベント type | 更新する sessions カラム |
|-------------|----------------------|
| status_changed | status, status_confidence |
| permission_request | status = 'waiting_permission' |
| permission_response | status = 'running' |
| cost_update | tokens_in, tokens_out, cost_usd |
| context_update | context_percent |
| error | error（最新エラーを上書き） |

```typescript
// AgentEvent は discriminated union。switch で型が絞られる。
// キャストは不要。
private materialize(sessionId: string, event: AgentEvent) {
  switch (event.type) {
    case "permission_request":
      // event.payload.requestId, .tool, .args が確定
      this.sessionRepo.update(sessionId, {
        status: "waiting_permission",
        status_confidence: event.confidence,
      });
      break;

    case "cost_update":
      // event.payload.tokens_in, .tokens_out, .cost_usd が確定
      this.sessionRepo.update(sessionId, {
        tokens_in: event.payload.tokens_in,
        tokens_out: event.payload.tokens_out,
        cost_usd: event.payload.cost_usd ?? 0,
      });
      break;

    case "context_update":
      // event.payload.context_percent が確定
      this.sessionRepo.update(sessionId, {
        context_percent: event.payload.context_percent,
      });
      break;

    case "error":
      // event.payload.message が確定
      this.sessionRepo.update(sessionId, { error: event.payload.message });
      break;

    case "message":
    case "tool_use":
    case "tool_result":
      // レジャーに追記するだけ。sessions テーブルは更新しない
      break;
  }
}
```

**注意**: message, tool_use, tool_result はレジャーに追記するだけで sessions テーブルは更新しない。

---

## 通知生成

イベントに基づいて notifications テーブルに INSERT + Push 通知を送信する。

```typescript
private maybeNotify(sessionId: string, event: AgentEvent) {
  const session = this.sessionRepo.get(sessionId);
  const task = this.taskRepo.get(session.task_id);

  switch (event.type) {
    case "permission_request":
      // event.payload.tool, .args が型で確定
      this.notificationService.create({
        session_id: sessionId,
        type: "permission_required",
        priority: "critical",
        title: task.title,
        body: `${event.payload.tool}(${event.payload.args.file_path ?? ""})`,
      });
      break;

    case "context_update":
      // event.payload.context_percent が型で確定
      if (event.payload.context_percent >= 90) {
        const existing = this.notificationRepo.findBySessionAndType(
          sessionId, "context_warning"
        );
        if (!existing) {
          this.notificationService.create({
            session_id: sessionId,
            type: "context_warning",
            priority: "high",
            title: task.title,
            body: `Context usage: ${event.payload.context_percent}%`,
          });
        }
      }
      break;
  }
}
```

**セッション終了時の通知は SessionRunner.onExit() で生成:**

```typescript
private onExit(sessionId: string, info: ExitInfo) {
  const session = this.sessionRepo.get(sessionId);
  const task = this.taskRepo.get(session.task_id);

  if (info.code === 0) {
    this.notificationService.create({
      session_id: sessionId,
      type: "session_done",
      priority: "normal",
      title: task.title,
      body: "Completed successfully",
    });
  } else {
    this.notificationService.create({
      session_id: sessionId,
      type: "session_failed",
      priority: "high",
      title: task.title,
      body: info.summary ?? `Exit code: ${info.code}`,
    });
  }
}
```

---

## WebSocket Push

### メッセージ型

クライアントに push するメッセージの型定義。

```typescript
type WsMessage =
  | { type: "session_event"; sessionId: string; event: SessionEventPayload }
  | { type: "status_changed"; sessionId: string; status: string; taskId: string }
  | { type: "context_update"; sessionId: string; contextPercent: number }
  | { type: "notification"; notification: NotificationPayload }
  | { type: "notification_read"; notificationId: number }
  | { type: "task_created"; task: TaskPayload }
  | { type: "terminal_data"; sessionId: string }  // binary frame は別チャネル

interface SessionEventPayload {
  seq: number;
  type: string;
  source: string;
  confidence: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

interface NotificationPayload {
  id: number;
  sessionId: string | null;
  type: string;
  priority: string;
  title: string;
  body: string | null;
  createdAt: string;
}
```

### チャネル設計

| チャネル | パス | フレーム | 内容 |
|---------|------|---------|------|
| メイン | `/ws` | JSON text | session_event, status_changed, context_update, notification, task_created |
| ターミナル | `/ws/terminal/:sessionId` | binary | PTY バイト列 |

**メインチャネル**: 全クライアントが接続。ダッシュボード更新に使用。
**ターミナルチャネル**: S3 実行ビューを開いたときのみ接続。セッション単位。

### 再接続プロトコル

クライアントが再接続したとき、サーバーは以下を送信:

```typescript
// ws.ts: onConnection
async function handleReconnect(ws: WebSocket) {
  // 1. 全タスクの最新状態
  const tasks = await taskService.listWithLatestSession();
  ws.send(JSON.stringify({ type: "sync", tasks }));

  // 2. 未読通知
  const notifications = await notificationService.listUnread();
  for (const n of notifications) {
    ws.send(JSON.stringify({ type: "notification", notification: n }));
  }
}
```

ターミナルチャネルの再接続:

```typescript
// ws.ts: onTerminalConnection
async function handleTerminalReconnect(ws: WebSocket, sessionId: string) {
  const runner = sessionRunners.get(sessionId);
  if (runner?.ringBuffer) {
    // Ring buffer の内容を replay
    ws.send(runner.ringBuffer.getAll());  // binary
  }
}
```

---

## auto_approve_rules

インメモリ状態。DB に永続化しない。

```typescript
class AutoApproveRules {
  // sessionId -> rules
  private rules = new Map<string, ApproveRule[]>();

  add(sessionId: string, rule: ApproveRule) {
    const existing = this.rules.get(sessionId) ?? [];
    existing.push(rule);
    this.rules.set(sessionId, existing);
  }

  matches(sessionId: string, event: AgentEvent): boolean {
    if (event.type !== "permission_request") return false;
    const rules = this.rules.get(sessionId);
    if (!rules) return false;

    const p = event.payload as { tool: string; args: Record<string, unknown> };
    return rules.some(r => r.tool === p.tool && this.matchPattern(r.pattern, p.args));
  }

  cleanup(sessionId: string) {
    this.rules.delete(sessionId);
  }

  private matchPattern(pattern: string, args: Record<string, unknown>): boolean {
    const filePath = (args.file_path ?? args.path ?? "") as string;
    // glob マッチ: "src/**" → src/ 以下すべて
    return minimatch(filePath, pattern);
  }
}

interface ApproveRule {
  tool: string;     // e.g. "Write"
  pattern: string;  // e.g. "src/**" or "*" (all)
}
```

**統合ポイント**: SessionRunner の handleEvent() 内で permission_request 時に照合。

```typescript
case "permission_request":
  if (this.autoApproveRules.matches(sessionId, event)) {
    // 自動承認
    this.eventRepo.insert({
      session_id: sessionId,
      seq: this.nextSeq(sessionId),
      type: "permission_response",
      source: "auto",
      confidence: "high",
      payload: JSON.stringify({ requestId: event.payload.requestId, approved: true }),
    });
    await agentSession.respondToPermission(event.payload.requestId, { approved: true });
    this.materialize(sessionId, { type: "permission_response", ... });
    this.wsBroadcast(sessionId, { type: "permission_response", ... });
    return;  // 通知は生成しない
  }
  // 自動承認に一致しない → 通常フロー（通知生成 + waiting_permission）
  break;
```

---

## イベント保持ポリシー

| データ | 保持期間 | 根拠 |
|--------|---------|------|
| session_events | 無期限 | 監査ログ。容量は小さい（1 セッション数百行程度） |
| notifications | 無期限 | cmux 教訓。ただし read=true のものは将来的に prune 可能 |
| ring buffer (in-memory) | セッション終了まで | 再接続 replay 用。サイズ上限 1MB/セッション |
| scrollback (disk) | 無期限 | セッション終了時に ring buffer をファイルに書き出し |

**容量見積もり**: 1 日 10 セッション x 500 イベント x 500 バイト/イベント = 2.5 MB/日。年間 ~1 GB。SQLite で十分。
