# Happy Coder (slopus/happy) Research

Date: 2026-03-07
Sources:
- https://github.com/slopus/happy

Mobile and Web Client for Claude Code & Codex. E2E encrypted cloud sync with local/remote mode switching.

---

## Overview

Mobile and Web Client for Claude Code & Codex. E2E encrypted cloud sync with local/remote mode switching.

---

## Architecture

### Package Structure

```
packages/
├── happy-cli    # CLI wrapper for Claude/Codex/Gemini (PTY + SDK modes)
├── happy-app    # Web/Mobile UI (Expo + React Native)
├── happy-server # Backend (Fastify + Prisma + Socket.IO)
├── happy-wire   # Shared types/protocols (Zod schemas)
└── happy-agent  # Remote agent control CLI
```

### happy-server

- Fastify 5 + Zod validation
- PostgreSQL (Prisma ORM) + PGLite for local dev
- Socket.IO at `/v1/updates`
- 3 connection types: user-scoped, session-scoped, machine-scoped
- Public key auth (TweetNaCl ed25519)
- All data encrypted at rest
- Prometheus metrics
- Post-commit callbacks for WS notifications

### happy-cli

- Mode switching: local (PTY) / remote (SDK) in a loop
- Session discovery via HTTP hook injected into Claude's SessionStart
- Mode-aware message queue (same permission mode grouped)
- Encrypted bidirectional RPC over Socket.IO
- Daemon mode for multi-session management
- Agent registry (factory pattern)

### happy-app

- Expo + React Native + Zustand + Unistyles
- libsodium (box/secretbox) + AES-256-GCM per-session encryption
- ElevenLabs React Native SDK for voice
- Responsive: Phone (tabs) / Tablet (permanent sidebar)
- Markdown parser + tool-specific views + Mermaid

### happy-wire

- 25+ Zod schemas with inferred TypeScript types
- discriminatedUnion on `t` (events), `role` (messages)
- Versioned values `{ version, value }` for optimistic updates
- CUID2 for message IDs

### happy-agent

- 8 CLI commands: auth, list, create, send, history, status, stop, wait
- Session prefix matching (partial ID resolution)
- Dual encryption: Legacy (SecretBox) + modern (AES-256-GCM)
- QR-code auth flow

### Wire Protocol (happy-wire)

Zod の discriminatedUnion でセッションイベントを型安全に定義:

```ts
sessionEventSchema = z.discriminatedUnion('t', [
  { t: 'text', text, thinking? },
  { t: 'tool-call-start', name, args },
  { t: 'tool-call-end', call },
  { t: 'turn-start' },
  { t: 'turn-end', status: 'completed' | 'failed' | 'cancelled' },
  { t: 'start', title? },
  { t: 'stop' },
  { t: 'service', text },
  { t: 'file', ref, name, size },
]);
```

- Update (persistent) vs Ephemeral (transient) イベントの分離
- seq ベースの順序保証（タイムスタンプではなく単調増加カウンタ）
- superRefine による cross-field validation

### EventRouter (happy-server)

WebSocket イベント配信の一元管理:

```ts
class EventRouter {
  emitUpdate(userId, payload, recipientFilter)   // 永続イベント
  emitEphemeral(userId, payload, recipientFilter) // 一時イベント
}

type RecipientFilter =
  | { type: 'all-interested-in-session'; sessionId }
  | { type: 'user-scoped-only' }
  | { type: 'machine-scoped-only'; machineId }
```

- 送信者除外（エコー防止）
- Post-commit callback でトランザクション後にイベント発火

### AgentBackend Interface (happy-cli)

エージェントのライフサイクル統一インターフェース:

```ts
interface AgentBackend {
  startSession(initialPrompt?): Promise<StartSessionResult>
  sendPrompt(sessionId, prompt): Promise<void>
  cancel(sessionId): Promise<void>
  onMessage(handler: AgentMessageHandler): void
  respondToPermission?(requestId, approved): Promise<void>
  dispose(): Promise<void>
}
```

AgentMessage 型（構造化されたエージェント出力）:

```ts
type AgentMessage =
  | { type: 'model-output'; textDelta?; fullText? }
  | { type: 'status'; status: 'starting' | 'running' | 'idle' | 'stopped' | 'error' }
  | { type: 'tool-call'; toolName; args; callId }
  | { type: 'tool-result'; toolName; result; callId }
  | { type: 'permission-request'; id; reason; payload }
  | { type: 'fs-edit'; description; diff?; path? }
  | { type: 'terminal-output'; data }
```

### Session Management (happy-cli)

- ハートビート: 2秒ごとに `session-alive` を送信
- 15分間 alive なしで非アクティブ判定
- thinking デバウンス: 500ms のディレイでチラつき防止
- waitForIdle: `agentState.controlledByUser` + `agentState.requests` でアイドル検出

### UI Patterns (happy-app)

- プロジェクトパス → マシン → セッション の 3 階層グルーピング
- inverted FlatList でチャット表示（最新が下）
- ツール種別ごとの専用ビュー（BashView, EditView with diff, WriteView）
- 接続ステータスをヘッダーに常時表示
- Zustand 単一ストア（~150 メソッド）

---

## Well-Regarded Features

### 1. Push Notifications

ユーザーが最も価値を感じている機能。セッションの状態変化をトリガーにプッシュ通知。

- 完了通知、エラー通知、入力要求通知
- セッションへの deep linking
- 「放置して後で見る」ワークフローの要

ユーザーの声: "Happy has made me so happy. I can finally leave my terminal knowing my agents are working."

### 2. Multi-Session Parallel Execution

複数のClaude Codeセッションを同時並行で実行・管理。

- プロジェクト別にセッションをグルーピング表示
- セッション間の切り替えがシームレス
- 各セッションが独立した状態管理を持つ

### 3. Real-Time Status (StatusDot + Thinking Indicator)

セッションの状態をリアルタイムに視覚表示。

- Green (steady) = running
- Yellow (pulsing) = thinking
- Gray = idle/disconnected
- Red = error
- thinking 状態のデバウンス (500ms) でチラつき防止

ユーザーの声: 「一覧画面でどのセッションが動いているか一目でわかる」

### 4. Seamless Device Switching

デスクトップ ↔ モバイルのシームレスな切り替え。

- キーボードのキーを押すだけでローカルに制御を戻せる
- WebSocket を通じたリアルタイム双方向通信
- コマンド履歴、環境変数、アクティブプロセスの状態を保持

### 5. Voice Coding

音声でのコーディング。単なるディクテーションではなく、コーディングコンテキストを理解したAI音声コマンド。

- ElevenLabs STT/TTS 統合
- コードセッションとは独立した会話状態管理
- ハンズフリーでコード・デバッグ・プロジェクト管理

### 6. Permission Prompts (Mobile)

MCP ツールコールやファイル編集の実行前にモバイルで許可/拒否。

- Allow/Deny ボタン
- "Remember for this session" オプション
- 粒度の細かいパーミッションカテゴリ（ファイル操作、APIコール、システムコマンド）

### 7. Custom Slash Commands & Agent Library

`~/.claude/agents/` ディレクトリのカスタムエージェントをモバイルに同期。

- インテリジェントなオートコンプリート
- コマンド履歴
- カテゴリ分けとお気に入り

### 8. File Mentions & Artifact System

生成されたコードを Artifact として保存・表示・編集。

- Markdown レンダリング + シンタックスハイライト
- Mermaid ダイアグラム対応
- ツール種別ごとの専用表示（Bash出力、diff表示、ファイル書き込み）

---

## Poorly-Regarded Features / Pain Points

### Top Issues by Reaction Count

| Reactions | Issue | Theme |
|-----------|-------|-------|
| 46 | OpenCode Support | Multi-agent demand |
| 41 | OpenCode support (duplicate) | Multi-agent demand |
| 36 | OpenCode support ($20k/day team) | Enterprise interest |
| 34 | 404 errors | Reliability |
| 29 | "Still maintained?" | Trust/maintenance |
| 27 | Claude Code v2.0.0 support | Version compatibility |
| 17 | Codex permission stuck | UX friction |
| 16 | Terminal "error" status wrong | Status accuracy |
| 16 | Unable to grant permissions (Codex) | Permission UX |
| 15 | askUserQuestion shows wrong UI | Permission UX |
| 14 | Local to remote loses history | Data integrity |
| 14 | --resume/--continue broken | Session continuity |

### Pain Point Categories

1. **信頼性**: クラウドリレー (api.cluster-fluster.com) の 404/522 エラーが頻発。SaaS 依存の弱点。
2. **パーミッション UI**: ボタンが反応しない、JSONがそのまま表示される、選択肢の意味がわからない。
3. **ステータス不正確**: 接続中なのに "Error" 表示。ステータス表示の正確性は信頼の根幹。
4. **モード切替時のデータ喪失**: ローカル→リモート切替で履歴が消える。
5. **バージョン追従**: Claude Code の新バージョンに追従が遅れると使えなくなる。

### User Criticism (App Store / Google Play)

- "Works with Claude but could be improved especially when the agent is giving you options to choose from. This tool simply displays the JSON with a yes and no choice which is out of context."
- "Bugs with git, copying is broken, can't send pics, can't see your files, lots of UX moments, but boy this app is outstanding if you can set up the server part properly."
- パーミッションプロンプトの green/blue/red ボタンが反応しない → yolo モードで回避するしかない

---

## User Feedback Summary

ユーザーが実際にどう使っているか:

- 会議中にリファクタリングタスクを監視
- 通勤中にプロダクションの問題をデバッグ
- ランチ中に API ドキュメントをレビュー
- 電話中にデータベースマイグレーションを監視
- ソファからデプロイを実行

コンセンサス: "Mobile Claude Code isn't a replacement for focused desktop work, but it's a powerful extension that keeps you productive in moments that were previously dead time."

---

## Learnings for banto

### What Users Actually Want

- **「放置できる安心感」が最大の価値。** 最も評価されているのは技術的な凄さではなく「画面を閉じて散歩に行ける」体験。Push通知、リアルタイムステータス、並列セッション管理がそれを支える。
- **ステータス表示の正確性は信頼の根幹。** 「接続中なのに Error 表示」で 16 リアクション。ステータスが嘘をつくと全体が信用できなくなる。
- **パーミッション UI は最大の UX 負債。** App Store/Google Play の不満の大半。JSON がそのまま表示される、ボタンが反応しない。エージェントとの対話 UI は見た目以上に難しい。

### Technical Design Lessons

- **Update と Ephemeral を型レベルで分ける。** DB 永続化イベント（状態変更）と WS のみのイベント（thinking、ハートビート）は性質が異なる。混ぜると「再送範囲」「reconnect 復元」が曖昧になる。
- **seq > timestamp。** 順序保証にタイムスタンプを使うとクロックスキューで壊れる。単調増加 seq なら確実。
- **discriminatedUnion は共有プロトコルの生命線。** Zod で定義し CLI/サーバー/アプリで共有。runtime validation も同時に得られる。
- **EventRouter でイベント発火を一元化。** WS の emit を各所に散らすと追跡不能。エコー防止やフィルタリングも一貫して扱える。
- **Post-commit callback。** DB 更新とイベント通知の間のクラッシュで不整合を防ぐ。

### UX Pattern Lessons

- **「投げて放置」の 3 要素:** 通知（何か起きたら教えて）+ ステータス一覧（全体一目）+ ディープリンク（通知から直行）。3つ揃って初めて「放置」が成立。
- **セッション一覧のグルーピングが重要。** フラットリストだと並列実行時に把握できない。
- **thinking デバウンス (500ms)。** 短い処理では表示せず、長い処理でのみ表示。小さいが体験への影響大。
- **ツール種別ごとの専用ビュー。** 汎用 JSON 表示は最悪の UX（Happy のパーミッション UI がまさにこれで叩かれている）。

### Business & Ecosystem Lessons

- **SaaS リレー依存はリスク。** 最大の不満が 404/522 エラー。セルフホスト可能なアーキテクチャは保険。
- **バージョン追従コストは継続的。** 上流 API/CLI に依存する場合、追従の仕組みを最初から考える。
- **マルチエージェント対応の需要は巨大。** OpenCode Support が合計 143 リアクション。$20k/day チームからの要望も。

---

## Sources

- https://happy.engineering/docs/features/
- https://apps.apple.com/us/app/happy-codex-claude-code-app/id6748571505
- https://play.google.com/store/apps/details?id=com.ex3ndr.happy
- https://www.blog.brightcoding.dev/2026/02/19/happy-coder-the-secure-mobile-cli-revolution
- https://alexcavender.com/blog/happy-coder-mobile-claude-code-integration
- https://blog.denv.it/posts/im-happy-engineer-now/
- https://github.com/slopus/happy/issues
