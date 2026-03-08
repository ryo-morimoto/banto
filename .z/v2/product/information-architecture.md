# 情報アーキテクチャ

エンティティ階層、各画面に表示されるデータ、データの関係性。
競合リサーチ（user-workflows-multi-agent.md, ui-ux-design-patterns.md）の知見を反映。

**原則**: DB 上は task/session を分離する（ライフサイクルが異なるため）。ただし UI ではユーザーに「セッション」を意識させない。ユーザーの管理単位は「タスク（目的）」であり、セッションは目的達成までの実行過程。5why 分析による結論。

---

## エンティティ階層

```
Project (リポジトリ)
  └─ Task (やること。1 story / 1 bug)
       └─ Session (エージェント実行。0..N per task)
            ├─ Event (エージェントが何をしたか。append-only)
            └─ Notification (ユーザーへの通知)
```

### エンティティ関係

| 関係 | カーディナリティ | 制約 |
|------|---------------|------|
| Project → Task | 1:N | タスクは必ず 1 プロジェクトに属する |
| Task → Session | 1:N | 同時にアクティブなセッションは最大 1（Principle #3） |
| Session → Event | 1:N | append-only。削除しない |
| Session → Notification | 1:N | セッション状態変化時に生成 |

---

## エンティティ属性

### Project

| 属性 | 型 | 説明 |
|------|-----|------|
| id | TEXT | 一意識別子 |
| name | TEXT | 表示名 |
| path | TEXT | ローカルリポジトリパス |
| created_at | DATETIME | 作成日時 |

### Task

| 属性 | 型 | 説明 |
|------|-----|------|
| id | TEXT | 一意識別子 |
| project_id | TEXT (FK) | 所属プロジェクト |
| title | TEXT | タスク名 |
| description | TEXT | マークダウン記述 |
| status | ENUM | backlog / active / done |
| pinned | BOOLEAN | ピン留め |
| created_at | DATETIME | 作成日時 |
| updated_at | DATETIME | 更新日時 |

**status の遷移:**
```
backlog → active（セッション開始時に自動）
active → done（ユーザーが手動で完了にする）
active → backlog（ユーザーが手動で戻す）
done → active（再度作業する場合）
```

### Session

| 属性 | 型 | 説明 |
|------|-----|------|
| id | TEXT | 一意識別子 |
| task_id | TEXT (FK) | 所属タスク |
| agent_provider | TEXT | プロバイダー識別子 |
| agent_session_id | TEXT | エージェント側のセッション/スレッド ID |
| title | TEXT | セッション内容の自動生成タイトル。完了時に保存。NULL = 未生成 |
| status | ENUM | pending / running / waiting_permission / done / failed |
| status_confidence | ENUM | high / medium / low |
| agent_mode | ENUM | build / plan。NULL = モード切替非対応 |
| context_percent | INTEGER | コンテキスト使用率 (0-100)。NULL = 不明 |
| agent_summary | TEXT | エージェントの最終メッセージ要約。完了時に保存 |
| diff_summary | JSON | git diff 集計。`{files: [{path, additions, deletions}], total_additions, total_deletions}` |
| started_at | DATETIME | 開始日時 |
| finished_at | DATETIME | 終了日時 |
| exit_code | INTEGER | 終了コード |
| error | TEXT | エラーメッセージ |
| instance_id | TEXT | 管理サーバーインスタンス ID |
| worktree_path | TEXT | Git ワークツリーパス |
| branch | TEXT | ブランチ名 |
| tokens_in | INTEGER | 入力トークン数 |
| tokens_out | INTEGER | 出力トークン数 |
| cost_usd | REAL | コスト（USD） |
| scrollback_path | TEXT | スクロールバック保存先パス |

> "Of all the fields on the dashboard, context usage has been the best predictor of where to look next." — Marc Nuri

**新規属性の根拠:**

| 属性 | 根拠 |
|------|------|
| title | OpenCode: hidden "Title" agent でセッションタイトルを自動生成。同一タスク内の複数実行を区別するために必要。S2 実行履歴で "#2 Edit auth.ts" のように表示 |
| agent_mode | OpenCode: Plan/Build モード切替が最も称賛された UX。Plan = 読み取り専用探索、Build = フルアクセス開発。mid-session で切替可能 |
| context_percent | Marc Nuri: 「次にどこを見るべきか」の最良予測指標。S1 カード・S3 ステータスバーに表示。F11 の閾値判定に使用 |
| agent_summary | Simon Willison: "Reviewing code that lands on your desk out of nowhere is a lot of work"。S3 Summary セクションで diff 前にコンテキスト提供。F5 完了フロー |
| diff_summary | CodeRabbit: AI PRs は 1.7x more issues。レビュー負荷軽減のため S1 カード・S3 Summary に diff stats を即表示。F5 完了フロー |

**status の遷移:**
```
pending → running（エージェント開始）
running → waiting_permission（権限リクエスト受信）
waiting_permission → running（権限応答後）
running → done（exit 0）
running → failed（exit != 0 or エラー）
pending → failed（起動失敗）
```

**context_percent の更新フロー (F2, F11):**
```
エージェントから context info 受信
  → sessions.context_percent UPDATE
  → sessions.tokens_in/out UPDATE
  → WS push: context_update
  → 90%+ の場合: notifications INSERT (context_warning)
```

### Event

| 属性 | 型 | 説明 |
|------|-----|------|
| id | INTEGER | 自動採番 |
| session_id | TEXT (FK) | 所属セッション |
| seq | INTEGER | セッション内連番 |
| type | ENUM | イベント種別（下表） |
| source | ENUM | hook / protocol / mcp / process / heuristic / user / auto |
| confidence | ENUM | high / medium / low |
| payload | JSON | イベント固有データ |
| occurred_at | DATETIME | 発生日時 |

**source の拡張:**

| source | 説明 | 根拠 |
|--------|------|------|
| hook | CC hooks (Notification, PostToolUse 等) | 既存 |
| protocol | Codex app-server JSON-RPC, ACP イベント | 既存 |
| mcp | CC --permission-prompt-tool MCP | 既存 |
| process | プロセス exit/signal | 既存 |
| heuristic | PTY 出力パース | 既存 |
| user | ユーザーの手動入力 (F4: mid-session steering) | F4 で追加。ユーザーのメッセージ送信イベント |
| auto | 自動承認ルールによる応答 (F3: Remember) | F3 で追加。手動/自動を区別 |

**イベント種別:**

| type | 説明 | 発火元 |
|------|------|--------|
| status_changed | セッション状態遷移 | 全プロバイダー |
| message | エージェントのテキスト出力 | protocol / hook / user |
| tool_use | ツール呼び出し（Read, Edit, Bash 等） | protocol / hook |
| tool_result | ツール実行結果 | protocol / hook |
| permission_request | 権限リクエスト | protocol / hook / mcp |
| permission_response | 権限応答（approve / deny） | user / auto |
| error | エラー発生 | 全プロバイダー |
| cost_update | トークン/コスト更新 | protocol / hook |
| context_update | コンテキスト使用率更新 | protocol / hook |
| compact | コンテキスト圧縮の開始 | hook (CC PreCompact) |
| mode_switched | エージェントモード切替 (build/plan) | protocol / user |

**新規イベント種別の根拠:**

| type | 根拠 |
|------|------|
| context_update | F11: コンテキスト枯渇警告。Marc Nuri の指標。context_percent 変化時に発火 |
| compact | CC PreCompact hook で検出。"Claude Code compaction silently destroyed 4 hours of my work" (DEV Community)。圧縮前にユーザーに通知し判断を促す |
| mode_switched | OpenCode: Plan/Build モード切替。エージェントのアクセスレベルが変わる重要なイベント。タイムラインに表示 |

### Notification

| 属性 | 型 | 説明 |
|------|-----|------|
| id | INTEGER | 自動採番 |
| session_id | TEXT (FK) | 関連セッション |
| type | ENUM | 通知種別（下表） |
| priority | ENUM | critical / high / normal |
| title | TEXT | 通知タイトル |
| body | TEXT | 通知本文 |
| read | BOOLEAN | 既読フラグ |
| created_at | DATETIME | 作成日時 |

> cmux Issue #963: "notifications are silently dropped—no storage, no ring, no record" (19 reactions)
> banto は全通知を DB に永続化する。transient notification は許容しない。

**新規属性の根拠:**

| 属性 | 根拠 |
|------|------|
| priority | F10: 通知ライフサイクル。critical (permission) は常に Push、normal (done) は設定依存。通知一覧での並べ替えにも使用 |

**通知種別:**

| type | トリガー | priority | Push 通知 |
|------|---------|----------|----------|
| permission_required | セッションが waiting_permission になった | critical | 常に送信 |
| session_done | セッションが done になった | normal | 設定に依存 |
| session_failed | セッションが failed になった | high | 常に送信 |
| context_warning | context_percent が 90% 超過 | high | 常に送信 |
| session_recovered | クラッシュ復旧でセッションが再開された | normal | 設定に依存 |
| session_orphaned | クラッシュ復旧で再開できずに failed にされた | high | 常に送信 |

**新規通知種別の根拠:**

| type | 根拠 |
|------|------|
| context_warning | F11: "Claude Code compaction silently destroyed 4 hours of my work" (DEV Community)。90% 超過でユーザーに判断を促す |

---

## セッション内インメモリ状態

DB に永続化せず、セッション実行中のみメモリに保持するデータ。

### auto_approve_rules

| 属性 | 型 | 説明 |
|------|-----|------|
| session_id | TEXT | 適用対象セッション |
| tool | TEXT | ツール名 (e.g. "Write") |
| pattern | TEXT | 対象パターン (e.g. "src/**") |

> F3: Remember for this session。同セッション内の同種権限リクエストを自動承認。
> セッション終了とともに破棄。永続化しない理由: セッションを跨いだ自動承認はセキュリティリスク。

**ライフサイクル:**
```
ユーザーが「Remember for this session」にチェック
  → auto_approve_rules に {session_id, tool, pattern} 追加
  → 以降の同種リクエスト: 自動 Approve + event INSERT (source: auto)
  → セッション終了 → ルール破棄
```

---

## 画面 × データマッピング

各画面がどのエンティティ/属性を表示するか。

### S1 ダッシュボード

ユーザーはタスクカードだけを見る。Session 属性はタスクの「現在の状態」として表示され、セッションという概念は露出しない。

| セクション | Project | Task | Session (内部) | Event | Notification |
|-----------|---------|------|---------|-------|-------------|
| ヘッダー | - | - | - | - | 未読カウント (read=false) |
| Needs Attention | name (PJ グループ外) | title, pinned | status, agent_provider, started_at, branch, error, context_percent | 最新 permission_request の payload | - |
| Pinned | name (PJ グループ外) | title, pinned | status, agent_provider, started_at, branch, context_percent | - | - |
| プロジェクト別 | name | title, status, pinned | status, agent_provider, started_at, branch, context_percent (running), diff_summary (done) | - | - |

**Needs Attention セクション表示条件:**
- `session.status = waiting_permission` — 権限待ち（モバイルインライン: [Approve] [Deny]）
- `session.status = failed` — 失敗（モバイルインライン: [Retry]）

> cmux notification rings: 要対応が埋もれると放置される。最上部に固定。

### S2 タスク詳細

| セクション | ユーザーに見えるもの | Project | Task | Session (内部) | Event |
|-----------|-------------------|---------|------|---------|-------|
| ヘッダー | PJ 名 + タスク名 | name | title | - | - |
| タスク説明 | 説明文 | - | description | - | - |
| 現在の実行状態 | ステータス・エージェント・経過時間・今何してるか | - | - | status, agent_provider, started_at, branch, tokens_in/out, cost_usd, context_percent | 最新イベント 1 件 (MO6) |
| 実行履歴 | 試行 #N、結果、かかった時間 | - | - | status, agent_provider, finished_at, exit_code, diff_summary, agent_summary | - |

### S3 実行ビュー

タスク名がヘッダー。「セッション #N」は表示しない。

| セクション | ユーザーに見えるもの | Session (内部) | Event |
|-----------|-------------------|---------|-------|
| ステータスバー | エージェント・ブランチ・時間・コスト・ctx % | agent_provider, branch, started_at, tokens_in/out, cost_usd, context_percent | - |
| ターミナル or 会話パネル | リアルタイム出力 | (PTY ストリーム or 構造化イベント) | 全イベント (リアルタイム) |
| タイムライン | 何をしたかの経過 | - | 全イベント (type, occurred_at, payload) |
| Summary (完了後) | 要約 + 変更ファイル | agent_summary, diff_summary | - |

**モード分岐:**
- `mode: "terminal"` (CC PTY, PTY fallback) → ターミナルパネル + タイムライン
- `mode: "structured"` (Codex app-server, ACP) → 構造化会話パネル + メッセージ入力 + タイムライン

### S7 権限応答

| セクション | ユーザーに見えるもの | Task | Session (内部) | Event |
|-----------|-------------------|------|---------|-------|
| モーダル | タスク名 + 何を承認するか | title | status | permission_request の payload (tool, file, diff) |
| Remember チェック | 「このタスク内で同種操作を自動承認」 | - | (auto_approve_rules に追加) | - |

### S8 設定

| セクション | Project | Notification |
|-----------|---------|-------------|
| エージェント設定 | - | - |
| 通知設定 | - | Push ON/OFF、通知対象 |
| 表示設定 | 全一覧 | - |

---

## 派生データ

DB に直接保存せず、表示時に導出するデータ。

| データ | 導出元 | 使用画面 | 根拠 |
|--------|--------|---------|------|
| タスクの表示ステータス | 最新 session.status（なければ task.status） | S1 | カードのステータスドット |
| needs_attention フラグ | session.status IN (waiting_permission, failed) | S1 | Needs Attention セクション表示判定 |
| セッション経過時間 | now() - session.started_at | S1, S2, S3 | カード・ステータスバー |
| 完了からの経過時間 | now() - session.finished_at | S1, S2 | "2h ago" 表示 |
| context_percent 色 | 0-70%: 通常, 70-90%: 黄, 90%+: 赤 | S1, S3 | F11: Marc Nuri "best predictor" |
| Git サマリー文字列 | session.diff_summary → "+N -M, K files" | S1, S2, S3 | カード 2 行目 |
| 未読通知数 | notifications WHERE read = 0 のカウント | S1 ヘッダー | 通知バッジ |
| プロジェクト内タスク数 | tasks WHERE project_id = X のカウント | S1 | PJ グループヘッダー |
| 最新イベント要約 | events ORDER BY seq DESC LIMIT 1 (per session) | S2 | MO6: "今エージェントが何をしているか" |
| アクティブセッション | sessions WHERE task_id = X AND status IN (pending, running, waiting_permission) | S2 | 同時最大 1 の制約 |
| モードラベル | session.agent_mode → "Build" / "Plan" / null | S3 ステータスバー | modeSwitching 対応時のみ表示 |
| セッションタイトル | session.title (自動生成 or null) | S2 実行履歴 | 試行 #N の下に表示 |
