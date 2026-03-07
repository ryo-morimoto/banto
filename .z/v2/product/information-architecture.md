# 情報アーキテクチャ

エンティティ階層、各画面に表示されるデータ、データの関係性。

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
| status | ENUM | pending / running / waiting_permission / done / failed |
| status_confidence | ENUM | high / medium / low |
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

**status の遷移:**
```
pending → running（エージェント開始）
running → waiting_permission（権限リクエスト受信）
waiting_permission → running（権限応答後）
running → done（exit 0）
running → failed（exit != 0 or エラー）
pending → failed（起動失敗）
```

### Event

| 属性 | 型 | 説明 |
|------|-----|------|
| id | INTEGER | 自動採番 |
| session_id | TEXT (FK) | 所属セッション |
| seq | INTEGER | セッション内連番 |
| type | ENUM | イベント種別（下表） |
| source | ENUM | hook / protocol / mcp / process / heuristic |
| confidence | ENUM | high / medium / low |
| payload | JSON | イベント固有データ |
| occurred_at | DATETIME | 発生日時 |

**イベント種別:**

| type | 説明 | 発火元 |
|------|------|--------|
| status_changed | セッション状態遷移 | 全プロバイダー |
| message | エージェントのテキスト出力 | protocol / hook |
| tool_use | ツール呼び出し（Read, Edit, Bash 等） | protocol / hook |
| tool_result | ツール実行結果 | protocol / hook |
| permission_request | 権限リクエスト | protocol / hook / mcp |
| permission_response | 権限応答（approve / deny） | banto |
| error | エラー発生 | 全プロバイダー |
| cost_update | トークン/コスト更新 | protocol / hook |

### Notification

| 属性 | 型 | 説明 |
|------|-----|------|
| id | INTEGER | 自動採番 |
| session_id | TEXT (FK) | 関連セッション |
| type | ENUM | 通知種別（下表） |
| title | TEXT | 通知タイトル |
| body | TEXT | 通知本文 |
| read | BOOLEAN | 既読フラグ |
| created_at | DATETIME | 作成日時 |

**通知種別:**

| type | トリガー |
|------|---------|
| permission_required | セッションが waiting_permission になった |
| session_done | セッションが done になった |
| session_failed | セッションが failed になった |
| session_recovered | クラッシュ復旧でセッションが再開された |
| session_orphaned | クラッシュ復旧で再開できずに failed にされた |

---

## 画面 × データマッピング

各画面がどのエンティティ/属性を表示するか。

| 画面 | Project | Task | Session | Event | Notification |
|------|---------|------|---------|-------|-------------|
| S1 ダッシュボード | name | title, status, pinned | status, agent_provider, started_at, tokens, git summary | - | 未読カウント |
| S2 タスク詳細 | name | 全属性 | 全セッション一覧（status, agent, duration, git summary） | - | - |
| S3 セッション詳細 | - | title | 全属性 | 全イベント（タイムライン） | - |
| S7 権限応答 | - | title | status | permission_request の payload | - |
| S8 設定 | 全一覧 | - | - | - | 通知設定 |

---

## 派生データ

DB に直接保存せず、表示時に導出するデータ。

| データ | 導出元 | 使用画面 |
|--------|--------|---------|
| タスクの表示ステータス | 最新 session.status（なければ task.status） | S1 |
| セッション経過時間 | now() - session.started_at | S1, S2, S3 |
| Git サマリー (+N -M, K files) | session 完了時の git diff 集計 | S1, S2, S3 |
| 未読通知数 | notifications WHERE read = 0 のカウント | S1 ヘッダー |
| プロジェクト内タスク数 | tasks WHERE project_id = X のカウント | S1 |
