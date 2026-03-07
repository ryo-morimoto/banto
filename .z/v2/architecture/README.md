# アーキテクチャ

## スコープ

具体的なコンポーネント設計、インターフェース定義、データモデル、プロトコル仕様。`.z/curation/architecture-decision.md` の概観を、全ての境界が実装可能になるレベルまで落とす。

## 成果物

| ファイル | 内容 | 状態 |
|---------|------|------|
| `agent-provider-interface.md` | AgentProvider / AgentSession / AgentCapabilities 型定義、メソッド契約、イベント分類 | 完了 |
| `providers/claude-code.md` | Claude Code プロバイダー: PTY 起動、hooks 統合、MCP 権限、resume | 完了 |
| `providers/codex.md` | Codex プロバイダー: app-server JSON-RPC、スレッドモデル | 完了 |
| `providers/acp.md` | ACP プロバイダー: クライアント実装、capability ネゴシエーション、universal fallback | 完了 |
| `providers/pty-fallback.md` | Raw PTY プロバイダー: 状態検出ヒューリスティクス | 完了 |
| `data-model.md` | SQLite スキーマ: テーブル、インデックス、マイグレーション、クエリパターン | 完了 |
| `api-routes.md` | Elysia REST + WebSocket エンドポイント、リクエスト/レスポンス型、エラーコード | 完了 |
| `terminal-relay.md` | サーバー側 PTY 管理、WebSocket バイナリプロトコル、Ring Buffer、クライアント描画 | 完了 |
| `event-system.md` | イベントレジャー: 追記フロー、実体化、通知生成、auto_approve、WebSocket push | 完了 |
| `dual-mode-ui.md` | ターミナルビュー vs 構造化会話ビュー: 使い分け条件、コンポーネント構造 | 完了 |
