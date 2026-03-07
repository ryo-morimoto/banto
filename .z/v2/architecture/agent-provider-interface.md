# Agent Provider Interface

AgentProvider / AgentSession の型定義、メソッド契約、イベント分類。
全プロバイダーが準拠する抽象。個別プロバイダーの実装詳細は `providers/` を参照。

Discriminated union で設計する。消費者は自分に関係ない capability を知る必要がない。

上流: `../../curation/architecture-decision.md` Section 4

---

## AgentSession（discriminated union）

セッションは `mode` で分岐する。各 variant は自分が持つメソッドだけを公開する。

```typescript
type AgentSession = TerminalSession | StructuredSession;
```

### 共通部分

```typescript
interface BaseSession extends EventEmitter<AgentSessionEvents> {
  readonly mode: "terminal" | "structured";
  readonly provider: AgentProvider;
  readonly resume: boolean;

  start(prompt: string): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
}
```

### TerminalSession

PTY ベース。Claude Code, PTY Fallback。

```typescript
interface TerminalSession extends BaseSession {
  readonly mode: "terminal";

  /** PTY 出力バイトストリーム。WebSocket 経由でクライアントにリレー */
  readonly terminalStream: ReadableStream<Uint8Array>;

  /** PTY にユーザー入力を書き込む */
  writeTerminal(data: Uint8Array): void;

  /** PTY サイズ変更 */
  resizeTerminal(cols: number, rows: number): void;
}
```

ターミナルモードでは:
- mid-session steering = PTY write（writeTerminal）
- 権限応答 = プロバイダーが permissions 対応なら respondToPermission イベント経由、非対応ならユーザーがターミナルで直接入力

### StructuredSession

プロトコルベース。Codex, ACP。

```typescript
interface StructuredSession extends BaseSession {
  readonly mode: "structured";

  /** 実行中のエージェントにメッセージ送信 */
  sendMessage(message: string): Promise<void>;

  /** 権限リクエストに応答 */
  respondToPermission(requestId: string, decision: PermissionDecision): Promise<void>;
}
```

構造化モードでは:
- mid-session steering = sendMessage
- 権限応答 = respondToPermission（全構造化プロバイダーが対応）

### 権限応答の解決

terminal モードでも CC は MCP 経由で権限制御できる。これを型でどう表現するか:

```typescript
// TerminalSession の権限応答は SessionRunner が仲介する。
// CC: SessionRunner が MCP permission waiter に応答を渡す
// PTY Fallback: 権限応答 API なし。ユーザーがターミナルで直接操作

// SessionRunner 側の分岐:
function handlePermissionResponse(session: AgentSession, requestId: string, decision: PermissionDecision) {
  switch (session.mode) {
    case "structured":
      // 型が respondToPermission を保証する
      session.respondToPermission(requestId, decision);
      break;
    case "terminal":
      // プロバイダー固有のメカニズム（CC: MCP waiter）
      // SessionRunner がプロバイダー別ハンドラに委譲
      permissionHandlers.get(session.provider.id)?.(requestId, decision);
      break;
  }
}
```

---

## AgentEvent（discriminated union）

`Record<string, unknown>` は使わない。type ごとに payload の型が確定する。

```typescript
type EventSource = "hook" | "protocol" | "mcp" | "process" | "heuristic" | "user" | "auto";
type Confidence = "high" | "medium" | "low";

type AgentEvent =
  | MessageEvent
  | ToolUseEvent
  | ToolResultEvent
  | PermissionRequestEvent
  | CostUpdateEvent
  | ContextUpdateEvent
  | ErrorEvent;

interface MessageEvent {
  type: "message";
  source: EventSource;
  confidence: Confidence;
  payload: {
    role: "assistant" | "user";
    content: string;
  };
}

interface ToolUseEvent {
  type: "tool_use";
  source: EventSource;
  confidence: Confidence;
  payload: {
    tool: string;
    args: {
      file_path?: string;
      command?: string;
      diff?: string;
      [key: string]: unknown;
    };
  };
}

interface ToolResultEvent {
  type: "tool_result";
  source: EventSource;
  confidence: Confidence;
  payload: {
    tool: string;
    result?: string;
    error?: string;
  };
}

interface PermissionRequestEvent {
  type: "permission_request";
  source: EventSource;
  confidence: Confidence;
  payload: {
    requestId: string;
    tool: string;
    args: Record<string, unknown>;
    description?: string;
  };
}

interface CostUpdateEvent {
  type: "cost_update";
  source: EventSource;
  confidence: Confidence;
  payload: {
    tokens_in: number;
    tokens_out: number;
    cost_usd?: number;
  };
}

interface ContextUpdateEvent {
  type: "context_update";
  source: EventSource;
  confidence: Confidence;
  payload: {
    context_percent: number;
    tokens_used: number;
    tokens_max: number;
  };
}

interface ErrorEvent {
  type: "error";
  source: EventSource;
  confidence: Confidence;
  payload: {
    message: string;
    code?: string;
  };
}
```

**使用例（型安全な switch）:**

```typescript
function handleEvent(event: AgentEvent) {
  switch (event.type) {
    case "message":
      // event.payload.role と event.payload.content が確定
      console.log(`${event.payload.role}: ${event.payload.content}`);
      break;
    case "tool_use":
      // event.payload.tool と event.payload.args が確定
      console.log(`Tool: ${event.payload.tool}`);
      break;
    case "permission_request":
      // event.payload.requestId が確定
      showPermissionUI(event.payload.requestId, event.payload.tool);
      break;
    // ... exhaustive check: 未処理の type があればコンパイルエラー
  }
}
```

---

## AgentProvider（discriminated union）

resume 対応の有無で分岐。optional メソッドを排除。

```typescript
type AgentProvider = ResumableProvider | NonResumableProvider;

interface BaseProvider {
  readonly id: string;
  readonly name: string;
  readonly mode: "terminal" | "structured";

  check(): Promise<string | null>;
  createSession(config: SessionConfig): AgentSession;
}

interface ResumableProvider extends BaseProvider {
  readonly resume: true;
  resumeSession(config: ResumeConfig): AgentSession;
}

interface NonResumableProvider extends BaseProvider {
  readonly resume: false;
}
```

**プロバイダー別の型:**

| Provider | 型 | mode | resume |
|----------|-----|------|--------|
| Claude Code | ResumableProvider | "terminal" | true |
| Codex | ResumableProvider | "structured" | true |
| ACP | ResumableProvider or NonResumableProvider | "structured" | agent 依存 |
| PTY Fallback | NonResumableProvider | "terminal" | false |

**使用例:**

```typescript
// Resume ボタン表示判定
if (provider.resume) {
  // provider.resumeSession が存在することが型で保証される
  showResumeButton();
}

// UI モード分岐
switch (provider.mode) {
  case "terminal":
    return <TerminalView />;
  case "structured":
    return <StructuredView />;
}
```

---

## SessionConfig / ResumeConfig

```typescript
interface SessionConfig {
  sessionId: string;
  prompt: string;
  projectPath: string;
  worktreePath?: string;
}

interface TerminalSessionConfig extends SessionConfig {
  terminalSize: { cols: number; rows: number };
}

interface ResumeConfig {
  sessionId: string;
  agentSessionId: string;
  projectPath: string;
  worktreePath?: string;
}

interface TerminalResumeConfig extends ResumeConfig {
  terminalSize: { cols: number; rows: number };
}
```

terminal プロバイダーは TerminalSessionConfig を受け取る。structured プロバイダーは SessionConfig を受け取る。terminalSize が不要な側に渡らない。

---

## イベント定義

```typescript
interface AgentSessionEvents {
  status: (status: AgentStatus) => void;
  event: (event: AgentEvent) => void;
  exit: (info: ExitInfo) => void;
}

type AgentStatusType = "running" | "waiting_permission" | "idle";

interface AgentStatus {
  status: AgentStatusType;
  confidence: Confidence;
}

interface ExitInfo {
  code: number;
  signal?: string;
  summary?: string;
}

interface PermissionDecision {
  requestId: string;
  approved: boolean;
}
```

**注意**: `pending`, `done`, `failed` は AgentSession が emit しない。SessionRunner がライフサイクルとして設定:
- `pending`: createSession() 後、start() 前
- `done`: exit + code === 0
- `failed`: exit + code !== 0、または spawn 失敗

---

## メソッド契約

### start()

| 前提条件 | 事後条件 |
|---------|---------|
| セッションが未開始 | プロセスが起動し、"status: running" が emit される |
| prompt が空でない | terminal モード: terminalStream が読み取り可能になる |
| projectPath が存在する | 失敗時は Promise が reject（"exit" は emit されない） |

**呼び出し回数**: 1 セッションにつき 1 回。再呼び出し不可。

### stop()

| 前提条件 | 事後条件 |
|---------|---------|
| start() 済み | SIGTERM 送信 → 5 秒猶予 → SIGKILL |
| プロセスが生存中 | "exit" イベントが emit される |

**冪等**: プロセスが既に終了していても安全に呼べる。

### respondToPermission() (StructuredSession のみ)

| 前提条件 | 事後条件 |
|---------|---------|
| mode = "structured" | 応答がエージェントに送信される |
| requestId が有効 | approved: true → 続行、false → スキップ/中止 |

**タイムアウト**: banto 側でタイムアウトは設けない。

### dispose()

| 前提条件 | 事後条件 |
|---------|---------|
| なし | 全リソース解放。PTY close。イベントリスナー除去 |

**呼び出しタイミング**: exit イベント後、または stop() の完了後。

---

## SessionRunner との関係

AgentSession はエージェントプロセスの薄いラッパー。ビジネスロジックは SessionRunner が担当。

```
AgentSession          SessionRunner              DB / WebSocket
  |                      |                         |
  | emit("status")       |                         |
  +--------------------->|                         |
  |                      | sessions UPDATE         |
  |                      +------------------------>|
  |                      | WS push: status_changed |
  |                      +------------------------>|
  |                      |                         |
  | emit("event")        |                         |
  +--------------------->|                         |
  |                      | switch (event.type) {   |
  |                      |   case "permission_request": ... |
  |                      |   case "cost_update": ...       |
  |                      | }                       |
  |                      | session_events INSERT   |
  |                      +------------------------>|
  |                      | WS push: session_event  |
  |                      +------------------------>|
  |                      |                         |
  | emit("exit")         |                         |
  +--------------------->|                         |
  |                      | sessions UPDATE (done/  |
  |                      |  failed)                |
  |                      | diff_summary 取得       |
  |                      | notifications INSERT    |
  |                      | scrollback 保存         |
  |                      +------------------------>|
  |                      | session.dispose()       |
  |                      |                         |
```

**責務分離:**

| 責務 | AgentSession | SessionRunner |
|------|-------------|---------------|
| プロセス spawn/kill | yes | no（session.start/stop を呼ぶ） |
| PTY I/O | yes (terminal) | no（ストリームを WS にパイプ） |
| プロトコル解析 | yes | no |
| 型付きイベント emit | yes | no |
| DB 書き込み | no | yes |
| 通知生成 | no | yes |
| WebSocket push | no | yes |
| auto_approve_rules 照合 | no | yes |
| diff_summary / agent_summary | no | yes |
| scrollback 永続化 | no | yes |

---

## Provider Registry

```typescript
interface AgentProviderRegistry {
  register(provider: AgentProvider): void;
  get(id: string): AgentProvider | undefined;
  listAvailable(): Promise<AvailableProvider[]>;
}

interface AvailableProvider {
  id: string;
  name: string;
  mode: "terminal" | "structured";
  resume: boolean;
}
```

**初期化フロー:**

```
1. 全プロバイダーを register()
2. S5 実行開始モーダル表示時に listAvailable()
3. listAvailable() は各プロバイダーの check() を実行し、利用可能なもののみ返す
4. ユーザーが選択 → get(id) → createSession()
```
