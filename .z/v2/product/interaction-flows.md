# インタラクションフロー

主要シナリオのステップバイステップ定義。
競合リサーチ（user-workflows-multi-agent.md, ui-ux-design-patterns.md）の行動パターンを反映。

**原則**: ユーザーの操作単位は「タスク」。内部実装としての session は DB に存在するが、フロー記述ではユーザー視点で「実行」と呼ぶ。

---

## F1: タスク作成 → 実行開始

```
ユーザー                      banto                         エージェント
  |                            |                              |
  | 「+ Task」タップ            |                              |
  +-------------------------->|                              |
  |                            | タスク作成モーダル表示         |
  | タイトル・説明・PJ 入力     |                              |
  +-------------------------->|                              |
  |                            | tasks INSERT (backlog)       |
  |                            | WS push: task_created        |
  |                            | ダッシュボードにタスク追加     |
  |<---------------------------+                              |
  |                            |                              |
  | 「Start」タップ             |                              |
  +-------------------------->|                              |
  |                            | エージェント選択モーダル表示   |
  | エージェント選択            |                              |
  +-------------------------->|                              |
  |                            | tasks UPDATE (active)        |
  |                            | sessions INSERT (pending)    |
  |                            | provider.createSession()     |
  |                            +----------------------------->|
  |                            | session.start(prompt)        |
  |                            +----------------------------->|
  |                            | sessions UPDATE (running)    |
  |                            | WS push: status_changed      |
  |<---------------------------+                              |
  | ダッシュボードが running に |                              |
```

**分岐: 起動失敗**
```
  |                            | provider.createSession()     |
  |                            +------------- x ------------->|
  |                            | sessions UPDATE (failed)     |
  |                            | error = "spawn failed: ..."  |
  |                            | notifications INSERT         |
  |                            | WS push: status_changed      |
  |<---------------------------+                              |
  | Needs Attention に表示     |                              |
```

---

## F2: 実行中のモニタリング

> "black box forcing users to wait for completion before reviewing git diffs" -- jarjoura, HN

ユーザーが実行ビュー（S3）を開いている間のリアルタイムデータフロー。

### terminal: true（CC PTY + hooks）

```
エージェント                   banto                         ユーザー
  |                            |                              |
  | -- PTY バイト出力 ------>  |                              |
  |                            | WS push: terminal binary     |
  |                            +----------------------------->|
  |                            |                              | ターミナルパネル更新
  |                            |                              |
  | -- hook: Notification --->  |                              |
  |    (tool_use: Read)        |                              |
  |                            | session_events INSERT        |
  |                            | sessions.context_percent UPD |
  |                            | WS push: session_event       |
  |                            +----------------------------->|
  |                            |                              | タイムラインに追加
  |                            |                              | ctx % バー更新
  |                            |                              |
  | -- hook: PostToolUse --->  |                              |
  |    (tool: Edit, file, diff)|                              |
  |                            | session_events INSERT        |
  |                            | WS push: session_event       |
  |                            +----------------------------->|
  |                            |                              | タイムライン: @ Edit(file) +N -M
```

### terminal: false（Codex app-server / ACP）

```
エージェント                   banto                         ユーザー
  |                            |                              |
  | -- JSON-RPC event ------> |                              |
  |    (message: "Reading...")  |                              |
  |                            | session_events INSERT        |
  |                            | WS push: session_event       |
  |                            +----------------------------->|
  |                            |                              | 会話パネル: [bot] "Reading..."
  |                            |                              |
  | -- JSON-RPC event ------> |                              |
  |    (tool_use: Edit, diff)  |                              |
  |                            | session_events INSERT        |
  |                            | WS push: session_event       |
  |                            +----------------------------->|
  |                            |                              | 会話パネル: [edit] Edit(file) inline diff
  |                            |                              | タイムライン: @ Edit(file) +N -M
```

**共通: コンテキスト使用率の伝搬**

```
  | -- context info ----------> |                              |
  |    (tokens, context %)     |                              |
  |                            | sessions.context_percent UPD |
  |                            | sessions.tokens_in/out UPD   |
  |                            | WS push: context_update      |
  |                            +----------------------------->|
  |                            |                              | ctx % バー更新
  |                            |                              | (S1 カードにも反映)
```

> "Of all the fields on the dashboard, context usage has been the best predictor of where to look next." -- Marc Nuri

---

## F3: 権限リクエスト応答

> "Buttons don't respond, JSON displays as raw text, no context." -- Happy Coder Issue #246 (36 reactions)

### ダッシュボードからの応答（デスクトップ）

```
エージェント                   banto                         ユーザー
  |                            |                              |
  | 権限リクエスト              |                              |
  | (tool: Write, file: pkg..)  |                              |
  +-------------------------->|                              |
  |                            | sessions UPDATE              |
  |                            |  (waiting_permission)        |
  |                            | session_events INSERT        |
  |                            |  (permission_request)        |
  |                            | notifications INSERT         |
  |                            |  (priority: critical)        |
  |                            | WS push: permission_request  |
  |                            | Push 通知送信                 |
  |                            +----------------------------->|
  |                            |                              |
  |                            |                              | S1: Needs Attention に浮上
  |                            |                              | S3: タイムラインに !! 表示
  |                            |                              | S7: 権限モーダル表示:
  |                            |                              |   Tool: Write
  |                            |                              |   File: package.json
  |                            |                              |   変更内容 diff プレビュー
  |                            |                              |
  |                            |                              | 「Approve」タップ
  |                            |<-----------------------------+
  |                            | session_events INSERT        |
  |                            |  (permission_response)       |
  |                            | provider.respondToPermission |
  |<---------------------------+                              |
  |                            | sessions UPDATE (running)    |
  |                            | WS push: status_changed      |
  |                            +----------------------------->|
  |                            |                              | Needs Attention から消える
  | 実行再開                   |                              |
```

### モバイルインライン応答

```
ユーザー（スマホ）              banto
  |                            |
  | Push 通知タップ             |
  +-------------------------->|
  |                            | S1 ダッシュボード表示
  |                            | Needs Attention セクション:
  |                            |  (orange) Fix auth . CC . waiting
  |                            |  "Write package.json"
  |                            |  [Approve] [Deny]
  |                            |
  | [Approve] タップ            |
  +-------------------------->|
  |                            | 即座に権限応答
  |                            | (S7 モーダルは経由しない)
```

### 自動承認（Remember）

```
ユーザー                      banto                         エージェント
  |                            |                              |
  | 権限応答時に                |                              |
  | [x] Remember for this task |                              |
  +-------------------------->|                              |
  |                            | auto_approve_rules に追加:   |
  |                            |  {session, tool, pattern}    |
  |                            |                              |
  |                            | -- 同種の権限リクエスト ------|
  |                            |<-----------------------------+
  |                            | auto_approve_rules に一致     |
  |                            | 自動で Approve               |
  |                            | session_events INSERT        |
  |                            |  (permission_response, auto) |
  |                            | WS push: session_event       |
  |                            +----------------------------->|
  |                            |                              | タイムライン: v Auto-approved
```

---

## F4: Mid-Session Steering（実行中の軌道修正）

> "You must explicitly stop the task to give instructions" -- OpenHands の制限
> "I wanted the code to look a certain way, but it kept pulling back" -- daxfohl, HN (agent drift)

### terminal: true（PTY 入力）

```
ユーザー                      banto                         エージェント
  |                            |                              |
  | 実行ビューを開いている      |                              |
  | ターミナルパネルにフォーカス |                              |
  |                            |                              |
  | キーボード入力:             |                              |
  | "Use zod instead of joi"   |                              |
  +-------------------------->|                              |
  |                            | PTY write(data)              |
  |                            +----------------------------->|
  |                            |                              | エージェントが入力を受信
  |                            |                              | 方針を修正して続行
```

### terminal: false（構造化メッセージ）

```
ユーザー                      banto                         エージェント
  |                            |                              |
  | 実行ビューを開いている      |                              |
  | メッセージ入力欄に記入:     |                              |
  | "Use zod instead of joi"   |                              |
  | [Send] タップ              |                              |
  +-------------------------->|                              |
  |                            | provider.sendMessage(msg)    |
  |                            +----------------------------->|
  |                            | session_events INSERT        |
  |                            |  (message, source: user)     |
  |                            | WS push: session_event       |
  |                            +----------------------------->|
  |                            |                              | 会話パネル: [user] "Use zod..."
  |                            |                              | エージェントが応答して続行
```

---

## F5: 実行完了 → 結果レビュー

> "Reviewing code that lands on your desk out of nowhere is a lot of work" -- Simon Willison
> "AI-authored PRs contain 1.7x more major issues" -- CodeRabbit

```
エージェント                   banto                         ユーザー
  |                            |                              |
  | exit(0)                    |                              |
  +-------------------------->|                              |
  |                            | sessions UPDATE (done)       |
  |                            | 最終メッセージを              |
  |                            |  agent_summary に保存         |
  |                            | git diff 取得 →              |
  |                            |  diff_summary に保存          |
  |                            |  (files, additions, deletions)|
  |                            | scrollback ディスクに保存     |
  |                            | notifications INSERT         |
  |                            | WS push: status_changed      |
  |                            | Push 通知送信                 |
  |                            +----------------------------->|
  |                            |                              |
  |                            |                              | S1: カードに (check) + diff stats
  |                            |                              |
  |                            |                              | タスクカードタップ
  |                            |                              +--> S2 タスク詳細
  |                            |                              |
  |                            |                              | 「Open」タップ
  |                            |                              +--> S3 実行ビュー:
  |                            |                              |  Summary セクション:
  |                            |                              |   [bot] agent_summary
  |                            |                              |   Changes: 3 files +42 -12
  |                            |                              |   ファイル一覧 + diff stats
  |                            |                              |  [View Full Diff]
  |                            |                              |  タイムラインで経過確認
```

---

## F6: 実行失敗 → リトライ

```
エージェント                   banto                         ユーザー
  |                            |                              |
  | exit(1) or エラー           |                              |
  +-------------------------->|                              |
  |                            | sessions UPDATE (failed)     |
  |                            | error 記録                   |
  |                            | scrollback ディスクに保存     |
  |                            | notifications INSERT         |
  |                            |  (priority: high)            |
  |                            | WS push: status_changed      |
  |                            | Push 通知送信                 |
  |                            +----------------------------->|
  |                            |                              | S1: Needs Attention に表示
  |                            |                              |  (red) + error 概要
  |                            |                              |
  |                            |                              | エラー内容確認（S2 or S3）
  |                            |                              | 説明を修正（任意）
  |                            |                              | 「Retry」タップ
  |                            |<-----------------------------+
  |                            | 新 session INSERT (pending)  |
  |                            | provider.createSession()     |
  |                            +----------------------------->| (新エージェント)
  |                            |                              |
  |                            |                              | S1: Needs Attention から消え
  |                            |                              |      running に変更
```

**分岐: Resume（resume 対応エージェントの場合）**
```
  |                            |                              | 「Resume」タップ
  |                            |<-----------------------------+
  |                            | provider.resume(session)     |
  |                            +----------------------------->| (同じ実行を再開)
  |                            | sessions UPDATE (running)    |
  |                            | agent_session_id は維持      |
```

---

## F7: クラッシュ復旧

> "The 'survive interruptions' piece is underrated" -- HN commenter
> "Claude Code lost my 4-hour session" -- DEV Community

```
                               banto (再起動)                ユーザー
                                |                              |
                                | instance_id 生成             |
                                | 孤立セッション検索:           |
                                |  status IN (running,         |
                                |   waiting_permission)        |
                                |  AND instance_id != current  |
                                |                              |
                                | -- 各孤立セッションに対し -- |
                                |                              |
                                | [resume 対応 + プロセス死亡]  |
                                | provider.resume(session)     |
                                |  成功 → sessions UPDATE      |
                                |          (running)           |
                                |  失敗 → 下記 fallback        |
                                |                              |
                                | [resume 非対応 or 失敗]       |
                                | sessions UPDATE (failed)     |
                                | error = "server restart"     |
                                | scrollback ディスクに保存     |
                                |                              |
                                | -- 全孤立セッション処理後 -- |
                                |                              |
                                | notifications INSERT (各件)  |
                                |  recovered: "Fix auth bug    |
                                |   resumed successfully"      |
                                |  orphaned: "Update CI        |
                                |   lost due to server restart" |
                                |                              |
                                | -- ユーザー接続時 --         |
                                | WS push: 全通知 + 最新状態   |
                                +----------------------------->|
                                |                              | S1: Needs Attention に
                                |                              |  復旧結果が表示される
```

---

## F8: モバイルでの朝チェック

> "Mobile Claude Code isn't a replacement for focused desktop work, but it's a powerful extension" -- Happy Coder

```
ユーザー（スマホ）              banto
  |                            |
  | PWA を開く（or Push 通知）  |
  +-------------------------->|
  |                            | S1 ダッシュボード表示
  |<---------------------------+
  |                            |
  | !! Needs Attention (2)     |
  | +------------------------+|
  | |(orange) Fix auth . CC . 12m   |
  | | "Write package.json"   ||
  | | [Approve] [Deny]       ||  <- インラインアクション
  | +------------------------+|
  | |(red) Update CI . Codex  |
  | | exit 1 . 3m ago        ||
  | | [Retry]                ||  <- インラインアクション
  | +------------------------+|
  |                            |
  | [Approve] タップ           |
  +-------------------------->|  即座に権限応答（モーダルなし）
  |                            |
  | [Retry] タップ             |
  +-------------------------->|  エージェント選択 → 新しい実行
  |                            |
  | (check) done タスクタップ  |
  +-------------------------->|
  |                            | S2 タスク詳細:
  |                            |  Summary + diff stats 表示
  |                            |  (フル diff はデスクトップで)
  |                            |
  | pin Pinned / PJ 別一覧確認 |
  | (スクロール)               |
  |                            |
  | 合計 2 分で完了             |
```

---

## F9: WebSocket 再接続

```
ユーザー                      banto
  |                            |
  | (WS 切断: ネットワーク障害) |
  | x--------------------x    |
  |                            |
  | (ネットワーク復旧)          |
  | WS 再接続要求               |
  +-------------------------->|
  |                            | 全タスク最新状態を送信
  |                            | 未読通知を送信
  |                            | アクティブターミナルの
  |                            |  ring buffer を replay
  |<---------------------------+
  |                            |
  | S1 ダッシュボードが         |
  |  最新状態に復帰             |
  | ターミナルパネルが           |
  |  スクロールバック復元        |
```

---

## F10: 通知ライフサイクル

> cmux: "notifications are silently dropped--no storage, no ring, no record" -- Issue #963 (19 reactions)
> banto は全通知を永続化する（cmux の教訓）

```
                               banto                         ユーザー
                                |                              |
  イベント発生:                  |                              |
  done/failed/                  |                              |
  waiting_permission             |                              |
                                | notifications INSERT         |
                                |  (type, priority, read=false)|
                                |                              |
  [ユーザーが接続中]             |                              |
                                | WS push: notification        |
                                +----------------------------->|
                                |                              | S1 ヘッダー: bell バッジ更新
                                |                              | ブラウザ通知表示
                                |                              |
  [ユーザーが離席中]             |                              |
                                | Push 通知送信                 |
                                |  (Web Push API)              |
                                | - - - - - - - - - - - - - ->| スマホに通知
                                |                              |
  [通知の消化]                   |                              |
                                |                              | 通知タップ or 該当画面を開く
                                |<-----------------------------+
                                | notifications UPDATE         |
                                |  (read=true)                 |
                                | WS push: notification_read   |
                                +----------------------------->|
                                |                              | bell バッジ更新
```

**通知優先度:**

| 優先度 | イベント | Push 通知 | 根拠 |
|--------|---------|----------|------|
| critical | waiting_permission | 常に送信 | ブロッキング。即時対応必要 |
| high | failed, orphaned | 常に送信 | 作業損失リスク |
| normal | done, recovered | 設定に依存 | 情報提供 |

---

## F11: コンテキスト枯渇の警告

> "Claude Code compaction silently destroyed 4 hours of my work" -- DEV Community
> "context usage has been the best predictor of where to look next" -- Marc Nuri

```
エージェント                   banto                         ユーザー
  |                            |                              |
  | context_percent = 85%      |                              |
  +-------------------------->|                              |
  |                            | sessions.context_percent UPD |
  |                            | WS push: context_update      |
  |                            +----------------------------->|
  |                            |                              | S1 カード: ctx 85% (黄色)
  |                            |                              | S3: ctx バーが黄色に
  |                            |                              |
  | context_percent = 95%      |                              |
  +-------------------------->|                              |
  |                            | sessions.context_percent UPD |
  |                            | notifications INSERT         |
  |                            |  (type: context_warning,     |
  |                            |   priority: high)            |
  |                            | WS push: context_update      |
  |                            | Push 通知送信                 |
  |                            +----------------------------->|
  |                            |                              | S1 カード: ctx 95% (赤)
  |                            |                              | ユーザー判断:
  |                            |                              |  - 放置（compact 待ち）
  |                            |                              |  - Stop → 成果確認 → 新しい実行
  |                            |                              |  - Resume で続行
```

**ctx % 閾値:**

| 範囲 | 表示色 | アクション |
|------|--------|----------|
| 0-70% | 通常（グレー） | 表示のみ |
| 70-90% | 黄色 | 注意喚起 |
| 90%+ | 赤 | 通知送信。ユーザー判断を促す |
