# vde-monitor から得た学び

Source: `.z/research/vde-monitor.md`
Date: 2026-03-06
banto Purpose: 一目で把握する — 何が動いているか、何が完了しているか、何を確認しないといけないか

---

## 1. 「見る」の設計が最重要

vde-monitor の価値の大部分は「セッションの状態を正しく推定してリアルタイムに表示する」こと。
ターミナル出力を流すだけでは「見る」にならない。

banto への学び:
- **状態推定 (state estimation)** がコア機能。PTY が生きているかどうかではなく、「エージェントが何をしているか」を構造化して見せる
- vde-monitor は 3 層で推定する: Hook Events (高信頼) > Polling (中) > Fingerprint (低)
- banto は PTY を所有しているので、出力パースだけで vde-monitor の Hook + Polling + Fingerprint 相当ができる。有利な立場

## 2. State Timeline = Watch の実体

vde-monitor の `SessionStateTimelineStore` は状態遷移を `{paneId, at, state, reason}` で記録する。
これが UI のタイムラインビューの実体。

banto への学び:
- **session_events テーブルが Watch 機能の核**。イベントがなければタイムラインは空で、ダッシュボードに表示するものがない
- vde-monitor はイベントをインメモリ + JSON に保存。banto は SQLite に保存することで検索・フィルタ・永続化が自然にできる
- 「3秒で状況を把握する」ためには、最新のイベント数件 + 現在のステータスだけで十分

## 3. Session Registry = インメモリ + Observer で十分

vde-monitor は DB を使わず `Map<paneId, SessionDetail>` + observer pattern で全セッションを管理。

banto への学び:
- ライブなセッション状態（PTY バッファ、WebSocket サブスクライバー、ステータス）はインメモリが正しい
- 永続化が必要なもの（セッション履歴、イベント）は SQLite
- この分離は banto の `ptyStore` (インメモリ) と `sessions` テーブル (SQLite) でそのまま適用できる

## 4. Multiplexer Abstraction = 将来のプロバイダー抽象化のヒント

vde-monitor は tmux と WezTerm を `MultiplexerRuntime` インターフェースで統一。
inspector / actions / screenCapture を共通 API で扱う。

banto への学び:
- banto のスコープには「Agent provider abstraction (beyond Claude Code)」が入っている
- vde-monitor の Multiplexer パターンをそのまま適用: `AgentRuntime` インターフェースを定義し、Claude Code 実装から始め、他プロバイダーは後から追加
- ポイントは「抽象化を先に作らない」こと。まず1つの実装を作り、2つ目が来たときに共通インターフェースを抽出する

## 5. JSONL File IPC = シンプルで堅牢なイベント通信

vde-monitor は Claude/Codex の hook スクリプトが JSONL ファイルに追記 → サーバーが tail する。
プロセス間通信を API 呼び出しではなくファイルで実現。

banto への学び:
- banto は PTY を所有しているので JSONL IPC は不要（出力を直接パースできる）
- ただし **Claude Code の hooks 機構** を将来使うなら、同じ JSONL パターンが使える
- PTY パース (低信頼) → Hooks (高信頼) への段階的移行パスがある

## 6. Notification Summary Bus = 通知スパム防止

vde-monitor の `summary-bus.ts` は急速な状態変化を集約して1つの通知にまとめる。

banto への学び:
- Push 通知はスコープに入っている
- running → waiting_input → running → waiting_input のような振動を1回の通知にまとめる必要がある
- summary bus パターン: 一定時間バッファ → 最新の状態だけ通知

## 7. Visibility-Aware Polling = 必須の最適化

vde-monitor は `useVisibilityPolling()` でタブ非表示時にポーリングを止める。

banto への学び:
- Tailscale 越しのモバイルアクセスではバッテリー・帯域が限られる
- タブ非表示時: SSE 切断 or WebSocket close
- タブ復帰時: 再接続 + 差分取得
- PWA で installable にするなら Service Worker でバックグラウンド処理もできる

## 8. Request Idempotency = UIの信頼性

vde-monitor はセッション操作に `requestId` を付与し、短時間の重複をデデュプリケートする。

banto への学び:
- セッション開始、Stop、Approve — これらは冪等でないと二重実行のリスクがある
- 特にモバイルのタッチ操作では二重タップが起きやすい
- サーバー側で requestId ベースのデデュプリケーションを入れる

## 9. API Client Architecture = 契約 → 実行 → フック の3層

vde-monitor のフロントエンドは API クライアントを3層に分離:
```
contract (型定義) → executors (fetch) → hooks (TanStack Query)
```

banto への学び:
- banto は Elysia + Eden で型安全な API クライアントが自動生成される
- Eden の型を直接 TanStack Query に渡す形で、vde-monitor の 3 層が 2 層に圧縮できる
- ただし executor 層を挟むと、リトライ・タイムアウト・エラー変換のカスタマイズがしやすくなる

## 10. Usage Cost Tracking = コスト意識

vde-monitor は `domain/usage-cost/` でプロバイダーごとのトークン使用量とコストを追跡。
LiteLLM の pricing データを取得し、セッションごとのコストを計算。

banto への学び:
- 複数エージェントを並列実行する = コストが見えにくくなる
- セッションごとのコスト追跡は「One Glance」の一部になりうる
- Claude Code の transcript からトークン数を抽出する手法は vde-monitor が実装済み

---

## まとめ: banto が vde-monitor から取るべきもの

### 思想レベル
- 「見る」は生テキストではなく構造化データ
- 状態推定の多層化 (複数ソースから信頼度つきで判定)
- タイムラインが Watch 機能の核

### パターンレベル
- Session events (状態遷移 + reason の記録)
- Notification summary bus (通知集約)
- Visibility-aware connection management
- Request idempotency
- Runtime abstraction (将来のプロバイダー抽象化に備え)

### やらなくていいこと
- vde-monitor は tmux/WezTerm を「外から監視する」設計。banto は PTY を「所有して実行する」設計。監視の仕組みが根本的に違う
- vde-monitor のファイルベース永続化。banto は SQLite がある
- vde-monitor の ANSI-to-HTML レンダリング。banto は libghostty-vt + WebGPU を使う
