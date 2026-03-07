# インタラクションフロー

主要シナリオのステップバイステップ定義。

---

## F1: タスク作成 → セッション開始

```
ユーザー                      banto                         エージェント
  │                            │                              │
  │ 「+ Task」タップ            │                              │
  ├──────────────────────────>│                              │
  │                            │ タスク作成モーダル表示         │
  │ タイトル・説明・PJ 入力     │                              │
  ├──────────────────────────>│                              │
  │                            │ tasks INSERT                 │
  │                            │ ダッシュボードにタスク追加     │
  │                            │<────────────────────────────│
  │ 「Start」タップ             │                              │
  ├──────────────────────────>│                              │
  │                            │ セッション開始モーダル表示     │
  │ エージェント選択            │                              │
  ├──────────────────────────>│                              │
  │                            │ sessions INSERT (pending)    │
  │                            │ provider.createSession()     │
  │                            ├─────────────────────────────>│
  │                            │ session.start(prompt)        │
  │                            ├─────────────────────────────>│
  │                            │ sessions UPDATE (running)    │
  │                            │ WS push: status_changed      │
  │<───────────────────────────│                              │
  │ ダッシュボードが running に │                              │
```

---

## F2: セッション実行中のモニタリング

```
エージェント                   banto                         ユーザー
  │                            │                              │
  │ ツール実行 (Read file)      │                              │
  ├──────────────────────────>│                              │
  │                            │ session_events INSERT        │
  │                            │ WS push: session_event       │
  │                            ├─────────────────────────────>│
  │                            │                              │ タイムラインに追加
  │                            │                              │
  │ [terminal: true]           │                              │
  │ PTY バイト出力              │                              │
  ├──────────────────────────>│                              │
  │                            │ WS push: terminal binary     │
  │                            ├─────────────────────────────>│
  │                            │                              │ ターミナルパネル更新
  │                            │                              │
  │ [terminal: false]          │                              │
  │ 構造化メッセージ            │                              │
  ├──────────────────────────>│                              │
  │                            │ session_events INSERT        │
  │                            │ WS push: session_event       │
  │                            ├─────────────────────────────>│
  │                            │                              │ 会話パネル更新
```

---

## F3: 権限リクエスト応答

```
エージェント                   banto                         ユーザー
  │                            │                              │
  │ 権限リクエスト              │                              │
  ├──────────────────────────>│                              │
  │                            │ sessions UPDATE              │
  │                            │  (waiting_permission)        │
  │                            │ notifications INSERT         │
  │                            │ WS push: permission_request  │
  │                            │ Push 通知送信                 │
  │                            ├─────────────────────────────>│
  │                            │                              │ 権限 UI 表示
  │                            │                              │
  │                            │                              │ 「Approve」タップ
  │                            │<─────────────────────────────│
  │                            │ provider.respondToPermission │
  │<───────────────────────────│                              │
  │                            │ sessions UPDATE (running)    │
  │                            │ WS push: status_changed      │
  │                            ├─────────────────────────────>│
  │ 実行再開                   │                              │
```

---

## F4: セッション完了 → 結果レビュー

```
エージェント                   banto                         ユーザー
  │                            │                              │
  │ exit(0)                    │                              │
  ├──────────────────────────>│                              │
  │                            │ sessions UPDATE (done)       │
  │                            │ git diff 取得・保存          │
  │                            │ scrollback ディスクに保存     │
  │                            │ notifications INSERT         │
  │                            │ WS push: status_changed      │
  │                            │ Push 通知送信                 │
  │                            ├─────────────────────────────>│
  │                            │                              │ ダッシュボードが done に
  │                            │                              │
  │                            │                              │ タスクカードタップ
  │                            │                              ├──> タスク詳細
  │                            │                              │ 「View Session」タップ
  │                            │                              ├──> セッション詳細
  │                            │                              │ diff サマリー確認
  │                            │                              │ タイムラインで経過確認
```

---

## F5: セッション失敗 → リトライ

```
エージェント                   banto                         ユーザー
  │                            │                              │
  │ exit(1) or エラー           │                              │
  ├──────────────────────────>│                              │
  │                            │ sessions UPDATE (failed)     │
  │                            │ error 記録                   │
  │                            │ notifications INSERT         │
  │                            │ WS push: status_changed      │
  │                            ├─────────────────────────────>│
  │                            │                              │ ダッシュボードが failed に
  │                            │                              │
  │                            │                              │ エラー内容確認
  │                            │                              │ 説明を修正（任意）
  │                            │                              │ 「Retry」タップ
  │                            │<─────────────────────────────│
  │                            │ 新 session INSERT (pending)  │
  │                            │ provider.createSession()     │
  │                            ├─────────────────────────────>│ (新エージェント)
```

---

## F6: クラッシュ復旧

```
                               banto (再起動)                ユーザー
                                │                              │
                                │ instance_id 生成             │
                                │ 孤立セッション検索:           │
                                │  status=running AND          │
                                │  instance_id != current      │
                                │                              │
                                │ [resume 対応エージェント]     │
                                │ provider.resume(session)     │
                                │ sessions UPDATE (running)    │
                                │                              │
                                │ [resume 非対応]               │
                                │ sessions UPDATE (failed)     │
                                │ error = "server restart"     │
                                │                              │
                                │ notifications INSERT         │
                                │ WS push (接続時)              │
                                ├─────────────────────────────>│
                                │                              │ 復旧結果を確認
```

---

## F7: モバイルでの朝チェック（Scenario 1）

```
ユーザー（スマホ）              banto
  │                            │
  │ PWA を開く                  │
  ├──────────────────────────>│
  │                            │ ダッシュボード表示:
  │                            │  - 3 done (green)
  │                            │  - 1 failed (red)
  │                            │  - 1 waiting_permission (orange)
  │<───────────────────────────│
  │                            │
  │ done タスクの diff 確認     │
  │ (タップ → サマリー表示)     │
  │                            │
  │ failed タスクの説明修正     │
  │ → Retry タップ             │
  ├──────────────────────────>│
  │                            │ 新セッション開始
  │                            │
  │ permission タスクの承認     │
  │ → Approve タップ           │
  ├──────────────────────────>│
  │                            │ 権限応答 → セッション再開
```

---

## F8: WebSocket 再接続

```
ユーザー                      banto
  │                            │
  │ (WS 切断: ネットワーク障害) │
  │ ×──────────────────────×   │
  │                            │
  │ (ネットワーク復旧)          │
  │ WS 再接続                  │
  ├──────────────────────────>│
  │                            │ 最新セッション状態を送信
  │                            │ アクティブターミナルの
  │                            │  ring buffer を replay
  │<───────────────────────────│
  │ 画面が最新状態に復帰       │
```
