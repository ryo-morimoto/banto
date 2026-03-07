# アーキテクチャ

## スコープ

具体的なコンポーネント設計、インターフェース定義、データモデル、プロトコル仕様。`.z/curation/architecture-decision.md` の概観を、全ての境界が実装可能になるレベルまで落とす。

## 成果物

| ファイル | 内容 | 状態 |
|---------|------|------|
| `agent-provider-interface.md` | AgentProvider / AgentSession / AgentCapabilities 型定義、メソッド契約、イベント分類 | - |
| `providers/claude-code.md` | Claude Code プロバイダー: PTY 起動、hooks 統合、MCP 権限、stream-json、resume | - |
| `providers/codex.md` | Codex プロバイダー: app-server JSON-RPC、スレッドモデル、型生成 | - |
| `providers/acp.md` | ACP プロバイダー: クライアント実装、capability ネゴシエーション、universal fallback 挙動 | - |
| `providers/pty-fallback.md` | Raw PTY プロバイダー: 状態検出ヒューリスティクス、ターミナルリレー | - |
| `data-model.md` | SQLite スキーマ: テーブル、インデックス、マイグレーション、イベントレジャー設計 | - |
| `api-routes.md` | Elysia REST + WebSocket エンドポイント、リクエスト/レスポンス型、エラーコード | - |
| `terminal-relay.md` | サーバー側 PTY 管理、WebSocket バイナリプロトコル、クライアント描画（restty/xterm.js） | - |
| `event-system.md` | イベントレジャー: イベント型、追記フロー、実体化、WebSocket でクライアントへ push | - |
| `dual-mode-ui.md` | ターミナルビュー vs 構造化会話ビュー: 使い分け条件、必要データ | - |
