# 技術検証

## スコープ

未検証の技術的仮定を特定し、PoC で検証する。各 PoC は仮説・成功基準・結果記録を持つ。

## 成果物

| ファイル | 内容 | 状態 |
|---------|------|------|
| `assumptions.md` | 全技術的仮定の一覧、確信度、外れた場合のリスク | done |
| `poc-acp-connection.md` | PoC: ACP 対応エージェントに接続、プロンプト送信、イベント受信 | done |
| `poc-claude-code-hooks.md` | PoC: Claude Code を hooks 付きで起動、hook イベントを HTTP で捕捉 | done |
| `poc-codex-app-server.md` | PoC: codex app-server 起動、JSON-RPC でタスク送信、構造化レスポンス受信 | done |
| `poc-terminal-relay.md` | PoC: PTY → WebSocket → ブラウザ描画（xterm.js primary / restty optional） | done |
| `poc-event-ledger.md` | PoC: append-only イベント書き込み + 実体化セッション状態読み取りの目標スループット達成 | done |
