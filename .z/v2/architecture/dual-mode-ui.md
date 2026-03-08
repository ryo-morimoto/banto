# Dual-Mode UI

ターミナルビュー vs 構造化会話ビューの使い分け条件、表示コンポーネント、データ要件。
S3 実行ビューの中核設計。

上流: `agent-provider-interface.md` (AgentProvider.mode, branded types)、`../product/screen-inventory.md` (S3)

---

## モード決定

```typescript
// provider.mode で分岐。match builder で網羅性保証
const MainPanel = match("mode", session.provider)
  .case("terminal",   () => <TerminalPanel sessionId={sessionId} />)
  .case("structured", () => <ConversationPanel sessionId={sessionId} />)
  .exhaustive();
```

| mode | 適用プロバイダー | S3 メインパネル |
|------|----------------|----------------|
| terminal | Claude Code, PTY Fallback | ターミナルパネル（PTY バイトストリーム描画） |
| structured | Codex, ACP | 構造化会話パネル（型付きイベント表示） |

---

## 共通コンポーネント

モードに関わらず表示するもの:

### StatusBar

```
CC . feat/auth . 12m . 14k/9k tokens . ~$0.12 . ctx 78%
```

| フィールド | データソース | 更新トリガー |
|-----------|------------|-------------|
| エージェント名 | session.agent_provider → provider.name | 固定 |
| モード (Build/Plan) | session.agent_mode | WS: mode_switched。クリックで切替（modeSwitching 対応時のみ） |
| ブランチ | session.branch | 固定 |
| 経過時間 | now() - session.started_at | 1 秒ごと（クライアント計算） |
| トークン | session.tokens_in / tokens_out | WS: cost_update |
| コスト推計 | session.cost_usd | WS: cost_update |
| ctx % | session.context_percent | WS: context_update |

ctx % の色:
- 0-70%: デフォルト色
- 70-90%: 黄色 (warning)
- 90%+: 赤 (danger)

### Timeline

折りたたみ可能。両モード共通。

```typescript
type TimelineEntry = {
  seq: number;
  time: string;                 // HH:MM
  type: SessionEvent["type"];   // AgentEvent + status_changed + permission_response
  summary: string;              // 1 行要約
  detail?: unknown;             // 展開時の詳細
};
```

| イベント type | アイコン | summary 例 |
|-------------|---------|-----------|
| tool_use (Read) | > | Read(src/auth.ts) |
| tool_use (Edit) | @ | Edit(src/auth.ts) +5 -3 |
| tool_use (Bash) | > | bash: bun test |
| permission_request | !! | Permission: Write(package.json) [Approve] |
| permission_response | v / x | Approved / Denied / Auto-approved |
| compact | ~ | Context compaction started (auto) |
| mode_switched | * | Switched to Plan mode |
| status_changed | * | running / done (exit 0) |
| error | x | Process exited with code 1 |
| cost_update | $ | 14k in / 9k out |

**データソース**: session_events テーブル。初回は REST で取得、以降は WS の session_event で追加。

### Summary (完了後)

session.status が done のときのみ表示。

| フィールド | データソース |
|-----------|------------|
| agent_summary | session.agent_summary |
| diff stats | session.diff_summary |
| ファイル一覧 | session.diff_summary.files |
| [View Full Diff] | GET /api/sessions/:id/diff |

---

## Terminal モード

### コンポーネント構造

```
+---------------------------------------------+
| StatusBar                                    |
+---------------------------------------------+
| TerminalPanel                                |
|   (xterm.js primary / restty optional)       |
|   - PTY バイトストリーム描画                   |
|   - キーボード入力 → WS binary → PTY write    |
+---------------------------------------------+
| Timeline (collapsible)                       |
|   - hooks 由来のイベントのみ                   |
|   - PTY 出力との重複あり（意図的）             |
+---------------------------------------------+
```

### データフロー

```
WS /ws/terminal/:sessionId  →  TerminalPanel (render)
WS /ws (session_event)       →  Timeline (append)
User keyboard               →  WS binary → PTY write
```

### Terminal モード固有の注意点

- **Timeline は hooks 由来のみ**: PTY 出力にすべてが表示されているため、Timeline は補助的。tool_use, permission_request 等の構造化データだけ表示。
- **入力フォーカス**: TerminalPanel にフォーカスがあるとき、全キー入力が PTY に送信される。Timeline や StatusBar にフォーカスがあるときは送信しない。
- **モバイル**: ターミナルは読み取り専用。キーボード入力は非推奨（AgentOS/vde-monitor の教訓）。

---

## Structured モード

### コンポーネント構造

```
+---------------------------------------------+
| StatusBar                                    |
+---------------------------------------------+
| ConversationPanel                            |
|   - メッセージ: [bot] テキスト               |
|   - ファイル読み込み: コードブロック           |
|   - 編集: inline diff                        |
|   - コマンド: 出力ブロック                    |
|   - 権限リクエスト: 構造化カード              |
+---------------------------------------------+
| MessageInput                                 |
|   [テキスト入力]              [Send]          |
+---------------------------------------------+
| Timeline (collapsible)                       |
|   - 全イベント                               |
+---------------------------------------------+
```

### ConversationPanel のレンダリング

session_events を type に応じて異なるコンポーネントで描画:

```typescript
function renderEvent(event: AgentEvent): ReactNode {
  return match("type", event)
    .case("message",            (e) => <MessageBubble role={e.payload.role} content={e.payload.content} />)
    .case("tool_use",           (e) => renderToolUse(e.payload.tool, e.payload.args))
    .case("tool_result",        (e) => <ToolResultBlock tool={e.payload.tool} result={e.payload.result} error={e.payload.error} />)
    .case("permission_request", (e) => <PermissionCard requestId={e.payload.requestId} tool={e.payload.tool} args={e.payload.args} />)
    .case("error",              (e) => <ErrorBlock message={e.payload.message} />)
    .case("compact",            (e) => <CompactWarning reason={e.payload.reason} />)
    .case("cost_update",        () => null)
    .case("context_update",     () => null)
    .exhaustive();
}

function renderToolUse(tool: string, args: ToolUseEvent["payload"]["args"]): ReactNode {
  if (tool === "Read") return <FileReadBlock path={args.file_path} />;
  if (tool === "Edit") return <DiffBlock path={args.file_path} diff={args.diff} />;
  if (tool === "Bash") return <CommandBlock command={args.command} />;
  return <ToolUseBlock tool={tool} args={args} />;
}
```

**網羅性**: 新しい AgentEvent variant を追加すると `.exhaustive()` がコンパイルエラー。`default: return null` で暗黙に握りつぶさない。

### MessageInput

```typescript
function MessageInput({ sessionId }: { sessionId: SessionId }) {
  const [message, setMessage] = useState("");

  const send = async () => {
    if (!message.trim()) return;
    await api.sessions[sessionId].message.post({ message });
    setMessage("");
  };

  return (
    <div>
      <textarea value={message} onChange={e => setMessage(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  );
}
```

**Enter で送信 / Shift+Enter で改行** のキーバインド。

### Structured モード固有の注意点

- **Timeline は全イベント**: ターミナル出力がないため、Timeline がイベントの正規の表示場所。ConversationPanel とデータは同じだが表示形式が異なる。
- **message (source: user)**: ユーザーの Send で生成。ConversationPanel に [user] バブルとして表示。
- **raw JSON を表示しない**: Happy Coder の教訓。tool_use の args はツール別にフォーマット。

---

## モード間で共通のインタラクション

| インタラクション | Terminal モード | Structured モード |
|-------------|---------------|-----------------|
| 権限応答 | Timeline の [Approve] or S7 モーダル | ConversationPanel の PermissionCard or S7 モーダル |
| Mid-session steering | キーボード入力 → PTY write | MessageInput → sendMessage() |
| Mode switching | StatusBar の [Build\|Plan] トグル | 同左 |
| Stop | StatusBar の [Stop] ボタン | 同左 |
| View Full Diff | Summary セクションのリンク | 同左 |
| タイムライン展開/折りたたみ | クリック | 同左 |

---

## Agent Mode Switching (Build/Plan)

OpenCode で最も称賛された UX パターン。エージェントのアクセスレベルを mid-session で切替。

### モード定義

| Mode | アクセスレベル | ユースケース |
|------|------------|------------|
| Build | フルアクセス（Read, Edit, Write, Bash） | 通常の開発 |
| Plan | 読み取り専用（Read, Glob, Grep のみ） | 探索、分析、計画。TH5 (scout) に該当 |

### UI

StatusBar にトグルとして表示。`provider.modeSwitching` が true の場合のみクリック可能。

```
CC . [Build|Plan] . feat/auth . 12m . 14k/9k . ~$0.12 . ctx 78%
       ^^^^^^^^^
       clickable toggle (modeSwitching 対応時のみ)
```

### プロバイダー別の実装

```typescript
// mode switching の実装は provider ごとに異なる
function switchMode(session: AgentSession, mode: AgentMode) {
  match("mode", session)
    .case("terminal", (s) => {
      // CC: slash command を PTY に書き込む
      const command = mode === "plan" ? "/plan\n" : "/build\n";
      s.writeTerminal(new TextEncoder().encode(command));
    })
    .case("structured", (s) => {
      // ACP: session/set_mode RPC call (capability dependent)
      s.switchMode?.(mode);
    })
    .exhaustive();
}
```

### データフロー

```
ユーザー                      banto                         エージェント
  |                            |                              |
  | [Plan] トグルクリック       |                              |
  +-------------------------->|                              |
  |                            | switchMode("plan")           |
  |                            +----------------------------->|
  |                            |                              | モード切替
  |                            |<-----------------------------+
  |                            | emit("modeSwitched", "plan") |
  |                            | session_events INSERT        |
  |                            |  (mode_switched)             |
  |                            | sessions UPDATE              |
  |                            |  (agent_mode = "plan")       |
  |                            | WS push: mode_switched       |
  |                            +----------------------------->|
  |                            |                              | StatusBar 更新
  |                            |                              | Timeline: * Switched to Plan
```
