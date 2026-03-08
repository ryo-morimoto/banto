# イベントシステム

イベントレジャーの設計、追記フロー、実体化、WebSocket でのクライアント push。
セッションの状態管理はすべてこのイベントシステムを経由する。

上流: `agent-provider-interface.md` (AgentEvent, Branded Types)、`data-model.md` (session_events テーブル)

---

## SessionEvent（レジャーの単位型）

`AgentEvent`（エージェントが emit するもの）に、SessionRunner が生成する内部イベントを加えた superset。
`session_events` テーブルに保存されるすべてのイベントの型。

```typescript
// AgentEvent (7 variants) — agent-provider-interface.md で定義。変更なし。
// SessionEvent (9 variants) — AgentEvent + SessionRunner 内部イベント。

type StatusChangedEvent = {
  type: "status_changed";
  source: EventSource;
  confidence: Confidence;
  payload: {
    status: SessionStatus;
    previous?: SessionStatus;
  };
};

type PermissionResponseEvent = {
  type: "permission_response";
  source: "user" | "auto";
  confidence: "high";
  payload: {
    requestId: RequestId;
    approved: boolean;
  };
};

type ModeSwitchedEvent = {
  type: "mode_switched";
  source: "protocol" | "user";
  confidence: "high";
  payload: {
    mode: AgentMode;
    previous?: AgentMode;
  };
};

type SessionEvent = AgentEvent | StatusChangedEvent | PermissionResponseEvent | ModeSwitchedEvent;
```

**関係:**
- `AgentEvent` = エージェントプロセスが emit する 7 variant。agent-provider-interface.md が定義
- `SessionEvent` = session_events に保存する 9 variant。AgentEvent は SessionEvent の部分集合
- `SessionEventType = SessionEvent["type"]` = data-model.md の CHECK 制約と 1:1 対応

---

## 全体フロー

```
AgentSession              SessionRunner             DB                WebSocket
  |                          |                      |                    |
  | emit("event", e)         |                      |                    |
  +------------------------->| record(e)            |                    |
  |                          |   seq = nextSeq()    |                    |
  |                          |   session_events INSERT                   |
  |                          |   +----------------->|                    |
  |                          |   materialize(e)     |                    |
  |                          |   +----------------->|                    |
  |                          |   maybeNotify(e)     |                    |
  |                          |   +----------------->|                    |
  |                          |   WS broadcast(e)    |                    |
  |                          |   +------------------------------------->|
  |                          |                      |                    |
  | emit("status", s)        |                      |                    |
  +------------------------->| → StatusChangedEvent |                    |
  |                          | record(e)            |                    |
  |                          |   (same pipeline)    |                    |
  |                          |                      |                    |
```

---

## イベントレジャー

### 追記フロー

SessionRunner が AgentSession の 2 つのチャネルを listen し、統一パイプライン `record()` に流す:

```typescript
class SessionRunner {
  private seqCounters = new Map<SessionId, number>();

  /** AgentSession のリスナー登録 */
  private attachListeners(sessionId: SessionId, session: AgentSession) {
    // emit("event") — AgentEvent はそのまま SessionEvent として record
    session.on("event", (event: AgentEvent) => {
      this.record(sessionId, event, session);
    });

    // emit("status") — AgentStatus → StatusChangedEvent に変換して record
    session.on("status", (status: AgentStatus) => {
      const event: StatusChangedEvent = {
        type: "status_changed",
        source: status.confidence === "high" ? "protocol" : "heuristic",
        confidence: status.confidence,
        payload: { status: status.status },
      };
      this.record(sessionId, event, session);
    });

    // emit("modeSwitched") — AgentMode → ModeSwitchedEvent に変換して record
    session.on("modeSwitched", (mode: AgentMode) => {
      const event: ModeSwitchedEvent = {
        type: "mode_switched",
        source: "protocol",
        confidence: "high",
        payload: { mode },
      };
      this.record(sessionId, event, session);
    });
  }

  /**
   * 統一パイプライン。全 SessionEvent がここを通る。
   * 1. Ledger append → 2. Auto-approve check → 3. Materialize → 4. Notify → 5. WS broadcast
   */
  private record(sessionId: SessionId, event: SessionEvent, session: AgentSession) {
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

    // 2. Auto-approve check (permission_request only)
    if (event.type === "permission_request" && this.autoApproveRules.matches(sessionId, event)) {
      const response: PermissionResponseEvent = {
        type: "permission_response",
        source: "auto",
        confidence: "high",
        payload: { requestId: event.payload.requestId, approved: true },
      };
      this.record(sessionId, response, session);  // 再帰: response も同じパイプラインで記録
      if (session.mode === "structured") {
        session.respondToPermission(event.payload.requestId, { requestId: event.payload.requestId, approved: true });
      }
      return;  // materialize / notify をスキップ（auto-approve が代わりに処理）
    }

    // 3. Materialize + Notify + Broadcast
    this.materialize(sessionId, event);
    this.maybeNotify(sessionId, event);
    this.wsBroadcast(sessionId, { seq, ...event });
  }

  private nextSeq(sessionId: SessionId): number {
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
| mode_switched | agent_mode |
| error | error（最新エラーを上書き） |

```typescript
private materialize(sessionId: SessionId, event: SessionEvent) {
  match("type", event)
    .case("status_changed", (e) => {
      this.sessionRepo.update(sessionId, {
        status: e.payload.status,
        status_confidence: e.confidence,
      });
    })
    .case("permission_request", (e) => {
      this.sessionRepo.update(sessionId, {
        status: "waiting_permission",
        status_confidence: e.confidence,
      });
    })
    .case("permission_response", (e) => {
      if (e.payload.approved) {
        this.sessionRepo.update(sessionId, {
          status: "running",
          status_confidence: "high",
        });
      }
    })
    .case("cost_update", (e) => {
      this.sessionRepo.update(sessionId, {
        tokens_in: e.payload.tokens_in,
        tokens_out: e.payload.tokens_out,
        cost_usd: e.payload.cost_usd ?? 0,
      });
    })
    .case("context_update", (e) => {
      this.sessionRepo.update(sessionId, {
        context_percent: e.payload.context_percent,
      });
    })
    .case("error", (e) => {
      this.sessionRepo.update(sessionId, { error: e.payload.message });
    })
    .case("compact",     () => {})  // レジャーに追記するだけ。通知は maybeNotify で処理
    .case("mode_switched", (e) => {
      this.sessionRepo.update(sessionId, { agent_mode: e.payload.mode });
    })
    .case("message",     () => {})  // レジャーに追記するだけ
    .case("tool_use",    () => {})
    .case("tool_result", () => {})
    .exhaustive();
}
```

**注意**: message, tool_use, tool_result はレジャーに追記するだけで sessions テーブルは更新しない。handler を `() => {}` にすることで明示。新しい SessionEvent variant を追加すると `.exhaustive()` がコンパイルエラーになる。

---

## 通知生成

イベントに基づいて notifications テーブルに INSERT + Push 通知を送信する。

```typescript
private maybeNotify(sessionId: SessionId, event: SessionEvent) {
  const session = this.sessionRepo.get(sessionId);
  const task = this.taskRepo.get(session.task_id);

  match("type", event)
    .case("permission_request", (e) => {
      this.notificationService.create({
        session_id: sessionId,
        type: "permission_required",
        priority: "critical",
        title: task.title,
        body: `${e.payload.tool}(${e.payload.args.file_path ?? ""})`,
      });
    })
    .case("context_update", (e) => {
      if (e.payload.context_percent >= 90) {
        const existing = this.notificationRepo.findBySessionAndType(
          sessionId, "context_warning"
        );
        if (!existing) {
          this.notificationService.create({
            session_id: sessionId,
            type: "context_warning",
            priority: "high",
            title: task.title,
            body: `Context usage: ${e.payload.context_percent}%`,
          });
        }
      }
    })
    .case("compact", (e) => {
      this.notificationService.create({
        session_id: sessionId,
        type: "context_warning",
        priority: "high",
        title: task.title,
        body: `Context compaction started (${e.payload.reason})`,
      });
    })
    .case("status_changed",      () => {})
    .case("permission_response", () => {})
    .case("mode_switched",       () => {})
    .case("message",             () => {})
    .case("tool_use",            () => {})
    .case("tool_result",         () => {})
    .case("cost_update",         () => {})
    .case("error",               () => {})
    .exhaustive();
}
```

**セッション終了時の通知は SessionRunner.onExit() で生成:**

```typescript
private onExit(sessionId: SessionId, info: ExitInfo) {
  const session = this.sessionRepo.get(sessionId);
  const task = this.taskRepo.get(session.task_id);

  // Extracts agent's last assistant message as summary.
  // Nullable — not all agents produce a final summary message.
  const lastMessage = this.eventRepo.findLastByType(sessionId, "message");
  const agentSummary = (lastMessage?.payload.role === "assistant")
    ? lastMessage.payload.content.slice(0, 200)
    : null;
  this.sessionRepo.update(sessionId, { agent_summary: agentSummary });

  // Auto-generate session title from events.
  // Uses the first tool_use event's target or first assistant message as a short title.
  // This distinguishes multiple sessions within the same task (e.g. "Edit auth.ts" vs "Fix CI pipeline").
  const title = this.generateSessionTitle(sessionId);
  if (title) {
    this.sessionRepo.update(sessionId, { title });
  }

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

### セッションタイトル自動生成

```typescript
/**
 * Generate a short session title from events.
 * Priority: first meaningful tool_use target > first assistant message > null.
 * Inspired by OpenCode's hidden "Title" agent, but simpler — no LLM call.
 */
private generateSessionTitle(sessionId: SessionId): string | null {
  // Try first Edit/Write tool_use for a file-based title
  const firstEdit = this.eventRepo.findFirstByType(sessionId, "tool_use", (e) =>
    ["Edit", "Write"].includes(e.payload.tool) && !!e.payload.args.file_path
  );
  if (firstEdit) {
    const file = firstEdit.payload.args.file_path!.split("/").pop()!;
    return `${firstEdit.payload.tool} ${file}`;
  }

  // Fallback: first assistant message, truncated
  const firstMsg = this.eventRepo.findFirstByType(sessionId, "message", (e) =>
    e.payload.role === "assistant"
  );
  if (firstMsg) {
    return firstMsg.payload.content.slice(0, 60).replace(/\n/g, " ");
  }

  return null;
}
```

---

## WebSocket Push

### メッセージ型

クライアントに push するメッセージの型定義。

```typescript
type SessionStatus = "pending" | "running" | "waiting_permission" | "done" | "failed";
type NotificationType = "permission_required" | "context_warning" | "session_done" | "session_failed";
type NotificationPriority = "critical" | "high" | "normal";

type WsMessage =
  | { type: "session_event"; sessionId: SessionId; event: SessionEventPayload }
  | { type: "status_changed"; sessionId: SessionId; status: SessionStatus; taskId: TaskId }
  | { type: "context_update"; sessionId: SessionId; contextPercent: number }
  | { type: "mode_switched"; sessionId: SessionId; mode: AgentMode }
  | { type: "notification"; notification: NotificationPayload }
  | { type: "notification_read"; notificationId: number }
  | { type: "task_created"; task: TaskPayload }
  | { type: "terminal_data"; sessionId: SessionId };  // binary frame は別チャネル

type SessionEventPayload = {
  seq: number;
  type: SessionEvent["type"];
  source: EventSource;
  confidence: Confidence;
  payload: SessionEvent["payload"];
  occurredAt: string;  // ISO 8601
};

type NotificationPayload = {
  id: number;
  sessionId: SessionId | null;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string | null;
  createdAt: string;  // ISO 8601
};
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
async function handleTerminalReconnect(ws: WebSocket, sessionId: SessionId) {
  const runner = sessionRunners.get(sessionId);
  if (runner?.ringBuffer) {
    ws.send(runner.ringBuffer.getAll());  // binary
  }
}
```

---

## auto_approve_rules

インメモリ状態。DB に永続化しない。

```typescript
class AutoApproveRules {
  private rules = new Map<SessionId, ApproveRule[]>();

  add(sessionId: SessionId, rule: ApproveRule) {
    const existing = this.rules.get(sessionId) ?? [];
    existing.push(rule);
    this.rules.set(sessionId, existing);
  }

  matches(sessionId: SessionId, event: SessionEvent): boolean {
    if (event.type !== "permission_request") return false;
    const rules = this.rules.get(sessionId);
    if (!rules) return false;

    // discriminated union で絞り込み済み。event.payload.tool, .args が確定
    return rules.some(r =>
      r.tool === event.payload.tool &&
      this.matchPattern(r.pattern, event.payload.args)
    );
  }

  cleanup(sessionId: SessionId) {
    this.rules.delete(sessionId);
  }

  private matchPattern(pattern: string, args: { file_path?: string; [key: string]: unknown }): boolean {
    const filePath = args.file_path ?? "";
    return minimatch(filePath, pattern);
  }
}

type ApproveRule = {
  tool: string;
  pattern: string;  // glob: "src/**" or "*" (all)
};
```

**統合ポイント**: `record()` パイプライン内で permission_request 時に照合。auto_approve が一致した場合、`PermissionResponseEvent` を再帰的に `record()` に流す。詳細はイベントレジャーの `record()` を参照。

---

## イベント保持ポリシー

| データ | 保持期間 | 根拠 |
|--------|---------|------|
| session_events | 無期限 | 監査ログ。容量は小さい（1 セッション数百行程度） |
| notifications | 無期限 | cmux 教訓。ただし read=true のものは将来的に prune 可能 |
| ring buffer (in-memory) | セッション終了まで | 再接続 replay 用。サイズ上限 1MB/セッション |
| scrollback (disk) | 無期限 | セッション終了時に ring buffer をファイルに書き出し |

**容量見積もり**: 1 日 10 セッション x 500 イベント x 500 バイト/イベント = 2.5 MB/日。年間 ~1 GB。SQLite で十分。
