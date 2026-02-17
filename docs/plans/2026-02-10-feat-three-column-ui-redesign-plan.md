---
title: "feat: 3カラムUI + マルチターン会話"
type: feat
date: 2026-02-10
brainstorm: docs/brainstorms/2026-02-10-ui-layout-redesign-brainstorm.md
---

# feat: 3カラムUI + マルチターン会話

## Overview

bantoのUI画面構成を2カラム（タスク一覧+タスク詳細）から3カラム（タスク一覧 | タスク情報+AgentTodo | チャットセッション）に変更し、マルチターン会話・TodoWrite表示・モーダルタスク作成を実装する。

## Problem Statement

1. **概念の重複**: 1タスク=1セッション（同時実行）なのに、複数セッションを操作できそうなUIになっている
2. **セッション対話の不在**: agentへの追加指示・確認応答がUIから行えない
3. **タスク作成の摩擦**: ヘッダーのドロップダウンが小さく、メモ→投入がスムーズでない
4. **情報配置の非効率**: タスク詳細にセッション履歴が混在し、必要な情報にたどり着きにくい

## Proposed Solution

```
+------------------+------------------------+---------------------------+
| タスク一覧        | タスク情報              | セッション                  |
|                  |                        |                           |
| [+ タスク追加]    | タイトル: xxx           | [agent] テスト書きます       |
|                  | ステータス: running     | [agent] ファイルを読みます    |
| --- Pinned ---   | プロジェクト: banto     | [tool] Read src/foo.ts     |
| * タスクA        | 説明:                  | [agent] 実装しました         |
|                  |   ここにメモが入る      |                           |
| --- Active ---   |                        | [確認待ち]                   |
|  banto           | --- Agent Todo ---     |  この変更でよいですか？       |
|  * タスクB ●     | [x] テスト作成          |  [承認] [却下]              |
|  * タスクC ●     | [ ] 実装               |                           |
|                  | [ ] リファクタ          | +---------------------------+
| --- Backlog ---  |                        | | 追加指示を入力...    [送信] |
|  project-x       |                        | +---------------------------+
|  * タスクD       |                        |                           |
+------------------+------------------------+---------------------------+
```

## Technical Approach

### Architecture

変更は4つのレイヤーにまたがる:

1. **データモデル**: メッセージ永続化テーブル追加、ログエントリ型の拡張
2. **Agent統合**: マルチターン対応（V1 `streamInput()`）、TodoWriteキャプチャ
3. **API**: メッセージ送信エンドポイント追加、SSEメッセージ型拡張
4. **UI**: 3カラムレイアウト、チャットビュー、Todoパネル、モーダルダイアログ

### Agent SDK マルチターン方式

Agent SDK v0.2.37は2つのマルチターン機構を提供:

- **V1 `query()` + `streamInput()`**: `query()` が返す `Query` オブジェクトに `streamInput(stream: AsyncIterable<SDKUserMessage>)` でフォローアップメッセージを送信
- **V2 `SDKSession`** (`@alpha`/UNSTABLE): `session.send(message)` + `session.stream()` の明示的API

**選択: V1 `streamInput()`** を採用する。V2はunstableで破壊的変更のリスクがある。

### Implementation Phases

**出荷単位と依存関係:**

```
Phase A: UIシェル（独立出荷可能）
  3カラムレイアウト + モーダル + 1タスク=1セッション表示
  バックエンド変更不要。現行API + logStoreで動作する。

Phase B: データモデル + メッセージ永続化
  messagesテーブル + TodoWriteカラム + waiting_for_input状態
  Phase Aと並行可能。

Phase C: Agent統合（Phase Bに依存）
  マルチターン + TodoWriteキャプチャ + メッセージDB保存
  streamInput()の動作確認がリスク。

Phase D: チャットUI + Todo表示（Phase A, B, Cに依存）
  チャット入力欄 + メッセージ送信 + TodoList表示
  全バックエンド機能が揃ってから実装。
```

Phase Aを先にマージすれば、3カラムの見た目とモーダルは即座に使える。Phase B-Dはバックエンドの動作確認後に順次マージ。

---

#### Phase A: UIシェル（独立出荷可能）

3カラムレイアウト・タスク作成モーダル・1タスク=1セッション表示を実装。現行のAPIとlogStoreで動作する。バックエンド変更不要。

##### A-1. 3カラムレイアウトシェル

`public/index.tsx`のレイアウトを3カラムに変更:

```tsx
<div className="flex flex-1 min-h-0">
  <aside className="w-64 flex-shrink-0 border-r overflow-y-auto">
    <TaskListPanel />
  </aside>
  <section className="w-80 flex-shrink-0 border-r overflow-y-auto">
    {selectedTask ? <TaskInfoPanel /> : <EmptyMiddle />}
  </section>
  <main className="flex-1 min-w-0 flex flex-col">
    {selectedTask ? <SessionChatPanel /> : <EmptyRight />}
  </main>
</div>
```

カラム幅: 左 `w-64`（256px）、中央 `w-80`（320px）、右 残り全部。リサイズ不可（YAGNI）。

**ファイル:**
- `public/index.tsx`: レイアウト構造変更

##### A-2. TaskInfoPanel（中央パネル）

現在の`TaskDetail`からセッション関連を除去し、タスク情報に特化:

- タイトル（インライン編集）
- ステータス + アクションボタン（activate / complete / reopen / pin）
- プロジェクト名
- 説明（DescriptionEditor）
- 添付ファイル
- Agent Todoセクション（Phase Aではプレースホルダー表示。Phase DでTodoWriteデータ連携）

**ファイル:**
- `src/client/tasks/TaskInfoPanel.tsx`: 新規作成（TaskDetailから分離）

##### A-3. SessionChatPanel（右パネル）- 読み取り専用版

Phase Aでは既存のSSEログストリームをチャット風に表示する**読み取り専用版**。入力欄はなし（Phase Dで追加）。

- メッセージ一覧（上から古い順、自動スクロール）
  - `text`メッセージ: 左寄せ、グレー背景
  - `tool`メッセージ: コンパクト表示（ツール名のみ）
  - `error`メッセージ: 赤テキスト
  - `status`メッセージ: 中央寄せ、グレーテキスト

**状態別の表示（Phase A時点）:**

| セッション状態 | 右パネル表示 |
|-------------|------------|
| セッションなし | 空状態 + 「セッション開始」ボタン |
| pending/provisioning | 「準備中...」インジケータ |
| running | ログメッセージ表示（読み取り専用） |
| done | ログメッセージ表示 + 「再実行」ボタン |
| failed | ログメッセージ + エラー表示 + 「再実行」ボタン |

**ファイル:**
- `src/client/sessions/SessionChatPanel.tsx`: 新規作成
- `src/client/sessions/ChatMessage.tsx`: 新規作成（メッセージレンダリング）

##### A-4. 1タスク=1セッション（UI表示）

TaskInfoPanelとSessionChatPanelは最新セッションのみを表示:

```typescript
// 最新セッションを取得（API側でtask_id + ORDER BY created_at DESC LIMIT 1）
const latestSession = sessions[0];  // or null
```

**ファイル:**
- `src/client/sessions/api.ts`: `getLatestSessionByTask()` 追加
- `src/server/sessions/routes.ts`: `GET /api/tasks/:id/session` （最新セッション取得）追加

##### A-5. タスク作成モーダル

現在のドロップダウンを適切なモーダルダイアログに変更:

```tsx
// src/client/tasks/CreateTaskModal.tsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="fixed inset-0 bg-black/50" onClick={onClose} />
  <div className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-6">
    {/* プロジェクト選択、タイトル、説明入力 */}
  </div>
</div>
```

Escキーで閉じる。フォーカストラップ付き。

**ファイル:**
- `src/client/tasks/CreateTaskModal.tsx`: 新規作成（CreateTask.tsxから移行）
- `src/client/tasks/CreateTask.tsx`: 削除（モーダルに置き換え）
- `public/index.tsx`: モーダル表示state追加

##### A-6. タスク一覧の実行中インジケータ

左パネルのTaskItemに、runningセッションがある場合のアニメーションインジケータを追加:

**ファイル:**
- `src/client/tasks/TaskList.tsx`: TaskItemにrunning状態表示追加

---

#### Phase B: データモデル + メッセージ永続化

現在の`logStore`（インメモリMap）はサーバー再起動で消失する。チャットUIのメイン表示として使うには永続化が必要。

**`logStore`と`messages`テーブルの役割分担:**
- **`messages`テーブル（DB）**: 永続化層。全メッセージをSQLiteに保存。ページリロード・サーバー再起動後の復元に使用
- **`logStore`（インメモリ）**: 通知層として残す。SSEのpub/sub配信に使用。DB書き込み後にlogStoreにもpushし、SSEサブスクライバーに即座に通知する

##### B-1. messagesテーブル追加

```sql
-- src/server/db.ts に追加
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    role TEXT NOT NULL,          -- 'user' | 'assistant' | 'tool' | 'status' | 'error'
    content TEXT NOT NULL,       -- テキスト or JSON文字列
    tool_name TEXT,              -- role='tool' のときツール名
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**ファイル:**
- `src/server/db.ts`: テーブル作成追加
- `src/shared/types.ts`: `Message` 型定義追加

##### B-2. TodoWriteステート保持

TodoWriteは最後の呼び出しが全体状態を置き換える（full replacement）。sessionsテーブルに列追加:

```sql
ALTER TABLE sessions ADD COLUMN todos TEXT;  -- JSON: TodoItem[]
```

```typescript
// src/shared/types.ts
interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}
```

**ファイル:**
- `src/server/db.ts`: ALTER TABLE追加
- `src/shared/types.ts`: `TodoItem` 型追加
- `src/server/sessions/repository.ts`: `updateTodos()` メソッド追加

##### B-3. セッション状態にwaiting_for_input追加

agentが確認を求めたときの状態:

```
pending -> provisioning -> running <-> waiting_for_input -> done | failed
```

**検出方法**: Agent SDKのメッセージストリームには直接的な「確認待ち」イベントがない。以下の方法で推定する:
- agentが`result`メッセージを送信し、`subtype`が`end_turn`（完了ではなくターン終了）のとき、最後のassistantメッセージが疑問文であれば`waiting_for_input`に遷移
- または、Agent SDKのV1 `query()`がiteratorを中断せずに新しいinputを待つ場合、一定時間メッセージが来なくなった時点で`waiting_for_input`と判定
- **NOTE**: Phase Cの実装時にAgent SDKの実際の挙動を確認して方式を確定する

**ファイル:**
- `src/shared/types.ts`: SessionStatus に `waiting_for_input` 追加
- `src/server/sessions/service.ts`: 状態遷移ルール更新

---

#### Phase C: Agent統合（Phase Bに依存）

##### C-1. runAgent()をマルチターン対応に変更

現在の`runAgent()`は`query()`を呼んで完了まで待つ単発実行。これを`streamInput()`対応に変更:

```typescript
// src/server/sessions/agent.ts
export function runAgent(opts: RunAgentOpts): AgentHandle {
  // query()を呼ぶ（現行と同じ）
  const response = query({ prompt, options });

  // AgentHandleを返し、外部からメッセージ注入可能にする
  return {
    response,  // AsyncIterable<BetaMessage> を処理するループ
    sendMessage: (msg: string) => {
      // streamInput()でユーザーメッセージを注入
      response.streamInput(userMessageStream(msg));
    },
    abort: () => abortController.abort(),
  };
}
```

**ファイル:**
- `src/server/sessions/agent.ts`: `AgentHandle` 型定義、`runAgent()` シグネチャ変更
- `src/server/sessions/runner.ts`: `AgentHandle` を保持、セッション完了まで解放しない

##### C-2. TodoWriteイベントキャプチャ

agentのメッセージループで`tool_use`ブロックを検査し、TodoWriteの`input`を抽出:

```typescript
// src/server/sessions/agent.ts のメッセージ処理ループ内
if (block.type === "tool_use" && block.name === "TodoWrite") {
  const todos = block.input.todos as TodoItem[];
  onTodoUpdate(todos);  // コールバックでrunnerに通知
}
```

**ファイル:**
- `src/server/sessions/agent.ts`: メッセージ処理ループにTodoWrite検出追加
- `src/server/sessions/runner.ts`: `onTodoUpdate` コールバックでDB更新 + SSE配信

##### C-3. メッセージのDB永続化

agentのメッセージループ内で、テキスト・ツール使用・エラーを`messages`テーブルに保存:

**ファイル:**
- `src/server/sessions/agent.ts`: `pushLog()` の代わりに `pushMessage()` でDB保存 + logStore通知
- `src/server/sessions/repository.ts`: `insertMessage()`, `listMessagesBySession()` 追加

##### C-4. AgentHandleのライフサイクル管理

ランナーが`AgentHandle`を保持し、セッション完了まで解放しない。メッセージ送信APIからアクセス可能にする:

```typescript
// src/server/sessions/runner.ts
const activeHandles = new Map<string, AgentHandle>();  // sessionId -> AgentHandle
```

**ファイル:**
- `src/server/sessions/runner.ts`: `activeHandles` Map追加、`sendMessage()` エクスポート
- `src/server/sessions/service.ts`: `sendMessage(sessionId, content)` メソッド追加

---

#### Phase D: API拡張 + チャットUI（Phase B, Cに依存）

##### D-1. メッセージ送信エンドポイント

```
POST /api/sessions/:id/messages
Body: { content: string }
```

セッションが`running`または`waiting_for_input`のときのみ受け付ける。`AgentHandle.sendMessage()`を呼び出す。

**ファイル:**
- `src/server/sessions/routes.ts`: POSTエンドポイント追加

##### D-2. SSEメッセージ型拡張

現在の`LogEntry`（`text | tool | error | status`）を拡張して、ユーザーメッセージ・TodoWrite更新も配信:

```typescript
// src/shared/types.ts
type LogEntryType = "text" | "tool" | "error" | "status" | "user_message" | "todo_update";
```

**ファイル:**
- `src/shared/types.ts`: `LogEntryType` 拡張
- `src/server/sessions/log-store.ts`: 新しいエントリタイプ対応
- `src/server/sessions/routes.ts`: SSEストリームにTodo更新イベント追加

##### D-3. メッセージ履歴取得エンドポイント

```
GET /api/sessions/:id/messages
```

DB永続化されたメッセージ一覧を返す。SSEに接続する前の初期データとして使用。

**ファイル:**
- `src/server/sessions/routes.ts`: GETエンドポイント追加

##### D-4. TodoWrite取得

セッション取得APIのレスポンスに`todos`フィールドを含める（既存の`GET /api/sessions/:id`を拡張）。

**ファイル:**
- `src/server/sessions/routes.ts`: レスポンスに`todos`追加
- `src/server/sessions/repository.ts`: `findById()` でtodosも返す

##### D-5. チャット入力欄 + メッセージ送信UI

Phase AのSessionChatPanelに入力エリアを追加:

- textarea + 送信ボタン（Enter送信、Shift+Enter改行）
- セッションが `running` or `waiting_for_input` のときのみ有効
- `waiting_for_input` 時は確認待ちバッジを表示

**状態別の表示（Phase D完了後の最終形）:**

| セッション状態 | 右パネル表示 |
|-------------|------------|
| セッションなし | 空状態 + 「セッション開始」ボタン |
| pending/provisioning | 「準備中...」インジケータ |
| running | チャット + 入力欄（有効） |
| waiting_for_input | チャット + 入力欄（有効）+ 確認待ちバッジ |
| done | チャット + 入力欄（無効）+ 「再実行」ボタン |
| failed | チャット + エラー表示 + 「再実行」ボタン |

**ファイル:**
- `src/client/sessions/ChatInput.tsx`: 新規作成
- `src/client/sessions/SessionChatPanel.tsx`: ChatInput組み込み、`sendMessage()` API呼び出し
- `src/client/sessions/api.ts`: `sendMessage()`, `listMessages()` 追加

##### D-6. TodoList表示

Phase AのTaskInfoPanelのプレースホルダーをTodoWriteデータ表示に置き換え:

**ファイル:**
- `src/client/tasks/TodoList.tsx`: 新規作成（TodoItem[]のチェックボックス表示、読み取り専用）
- `src/client/tasks/TaskInfoPanel.tsx`: TodoList組み込み

---

## Acceptance Criteria

### Functional Requirements

- [x] 3カラムレイアウトが正しく表示される（デスクトップ）
- [x] タスク選択で中央パネル（タスク情報）と右パネル（セッション）が連動更新される
- [x] タスク未選択時に中央・右パネルに空状態が表示される
- [x] モーダルダイアログでタスクを作成できる（プロジェクト選択+タイトル+説明）
- [x] agentの実行中にチャット風メッセージが表示される
- [ ] チャット入力欄から追加指示を送信できる（running/waiting_for_input時）
- [ ] AgentのTodoWriteが中央パネルにリアルタイム表示される
- [x] 1タスク=1セッション（UIでは最新セッションのみ表示）
- [x] セッション完了後に「再実行」で新しいセッションを開始できる
- [ ] メッセージ履歴がDB永続化され、ページリロードで消えない
- [x] Pin/unpin、ステータス変更が中央パネルから操作できる

### Non-Functional Requirements

- [ ] サーバー再起動後もメッセージ履歴が復元される
- [ ] SSEストリームが途切れた場合にリロードで復旧可能

## Dependencies & Prerequisites

- Agent SDK v0.2.37の`streamInput()` APIが動作すること（V1 Query API）
- Agent SDKのメッセージストリームで`tool_use`ブロックの`input`フィールドにアクセスできること

## Risk Analysis & Mitigation

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| `streamInput()` が期待通り動作しない | マルチターン不可 | V2 `SDKSession` にフォールバック、またはマルチターンをPhase 2として分離 |
| TodoWriteの`input`がメッセージストリームに含まれない | Todo表示不可 | `PostToolUse` hookで代替キャプチャ |
| 3カラムの横幅が狭い画面で崩れる | レイアウト破綻 | `min-w-[1024px]` を設定し、狭い画面では水平スクロール |

## References & Research

### Internal References

- 現行レイアウト: `public/index.tsx:82-143`
- Agent統合: `src/server/sessions/agent.ts:35-121`
- SSEログストリーム: `src/server/sessions/routes.ts:73-113`
- logStore: `src/server/sessions/log-store.ts`
- セッション実行: `src/server/sessions/runner.ts`
- DBスキーマ: `src/server/db.ts`
- 共有型定義: `src/shared/types.ts`

### Brainstorm

- `docs/brainstorms/2026-02-10-ui-layout-redesign-brainstorm.md`
