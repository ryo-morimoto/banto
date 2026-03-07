# Agent Provider Interface

AgentProvider / AgentSession の型定義、メソッド契約、イベント分類。
全プロバイダーが準拠する抽象。個別プロバイダーの実装詳細は `providers/` を参照。

上流: `../../curation/architecture-decision.md` Section 4

---

## 型設計方針

1. **Discriminated union**: 消費者は自分に関係ない capability を知る必要がない
2. **Branded types**: `string` はドメインの意図を喪失する。ID は branded type で取り違えをコンパイル時に検出
3. **`type` デフォルト**: `interface` は declaration merging で外部から拡張される。sealed な型は `type` で定義。`interface` は意図的拡張点（EventEmitter 等の外部契約）のみ
4. **Exhaustive match**: discriminated union の分岐は `match` builder で網羅性を保証。ts-pattern のアーキテクチャを参考に 25 行で再現。外部依存は不要

---

## Branded Types

全 ID 型の基盤。ランタイムコストゼロ。`unique symbol` で他の branded type と交差しない。

```typescript
// shared/brand.ts
declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };
```

ドメイン ID の定義:

```typescript
// shared/ids.ts
type SessionId = Brand<string, "SessionId">;
type TaskId = Brand<string, "TaskId">;
type ProjectId = Brand<string, "ProjectId">;
type ProviderId = Brand<string, "ProviderId">;
type RequestId = Brand<string, "RequestId">;

// Constructor（バリデーション + ブランド付与の唯一の入口）
const SessionId = (raw: string): SessionId => raw as SessionId;
const TaskId = (raw: string): TaskId => raw as TaskId;
const ProjectId = (raw: string): ProjectId => raw as ProjectId;
const ProviderId = (raw: string): ProviderId => raw as ProviderId;
const RequestId = (raw: string): RequestId => raw as RequestId;
```

**効果**: `getSession(taskId)` がコンパイルエラーになる。`string` では通っていた。

```typescript
declare function getSession(id: SessionId): Session;

const tid = TaskId("task-123");
getSession(tid);  // Compile error: TaskId is not assignable to SessionId
```

---

## Exhaustive Match

discriminated union の分岐を式として書くためのユーティリティ。
ts-pattern のアーキテクチャを参考に、banto に必要な部分だけ 25 行で再現。

**設計原則（ts-pattern と同じ）:**
- **型レイヤーとランタイムレイヤーを分離する**。型は `Remaining` generic で網羅性を追跡。ランタイムは単純な分岐。
- **接合点に 1 箇所だけ `as any`**。ts-pattern, Zod, Effect すべて同じ手法。ユーザーからは見えない。
- **`[Remaining] extends [never]` で網羅性をゲート**。残りが `never` なら呼べる。残っていたらコンパイルエラー。

### match — builder 式 matcher

```typescript
// shared/match.ts

// === 型レイヤー ===

type Cases<T, K extends keyof T, Remaining, R> = {
  /** variant を 1 つ処理する。Remaining から除外される */
  case<
    V extends Remaining extends Record<K, infer M extends string> ? M : never,
    R2,
  >(
    value: V,
    handler: (variant: Extract<T, Record<K, V>>) => R2,
  ): Cases<T, K, Exclude<Remaining, Record<K, V>>, R | R2>;

  /** 全 variant が処理済みなら値を返す。未処理があればコンパイルエラー */
  exhaustive: [Remaining] extends [never]
    ? () => R
    : NonExhaustiveError<Remaining>;
};

type NonExhaustiveError<Remaining> = {
  readonly error: "Non-exhaustive match";
  readonly remaining: Remaining;
};

// === ランタイムレイヤー（untyped — ts-pattern と同じ手法） ===

class MatchExpr {
  private result: { matched: false } | { matched: true; value: unknown } = { matched: false };
  constructor(private key: string, private input: unknown) {}

  case(tag: string, handler: (v: unknown) => unknown): this {
    if (!this.result.matched && (this.input as any)[this.key] === tag) {
      this.result = { matched: true, value: handler(this.input) };
    }
    return this;
  }

  exhaustive(): unknown {
    if (!this.result.matched) {
      throw new Error(`Non-exhaustive match: unhandled ${(this.input as any)[this.key]}`);
    }
    return this.result.value;
  }
}

// === 接合点（唯一の as any） ===

function match<T extends Record<K, string>, K extends keyof T>(
  key: K,
  value: T,
): Cases<T, K, T, never> {
  return new MatchExpr(key as string, value) as any;
}
```

### 使い分け

| パターン | 用途 | 例 |
|---------|------|-----|
| `match(key, value).case().exhaustive()` | discriminated union の分岐（式・副作用問わず） | セッション分岐、materialize、通知生成 |
| `{ ... } satisfies Record<T, V>` | 静的マッピング（関数不要） | ステータスラベル、色マップ |
| `if (provider.resume)` | boolean discriminant | resume 判定 |

**`match` は副作用にも使える**: handler 内で DB 更新や通知生成を行い、戻り値は無視してよい。`switch` + `assertNever` は不要。

---

## AgentSession（discriminated union）

セッションは `mode` で分岐する。各 variant は自分が持つメソッドだけを公開する。

```typescript
type AgentSession = TerminalSession | StructuredSession;
```

### 共通部分

`BaseSession` は `extends EventEmitter` が必要なため `interface` を使う（外部契約）。
ただし直接使用は禁止。TerminalSession / StructuredSession 経由のみ。

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
type TerminalSession = BaseSession & {
  readonly mode: "terminal";

  /** PTY 出力バイトストリーム。WebSocket 経由でクライアントにリレー */
  readonly terminalStream: ReadableStream<Uint8Array>;

  /** PTY にユーザー入力を書き込む */
  writeTerminal(data: Uint8Array): void;

  /** PTY サイズ変更 */
  resizeTerminal(cols: number, rows: number): void;
};
```

### StructuredSession

プロトコルベース。Codex, ACP。

```typescript
type StructuredSession = BaseSession & {
  readonly mode: "structured";

  /** 実行中のエージェントにメッセージ送信 */
  sendMessage(message: string): Promise<void>;

  /** 権限リクエストに応答 */
  respondToPermission(requestId: RequestId, decision: PermissionDecision): Promise<void>;
};
```

ターミナルモードでは:
- mid-session steering = PTY write（writeTerminal）
- 権限応答 = プロバイダーが permissions 対応なら respondToPermission イベント経由、非対応ならユーザーがターミナルで直接入力

構造化モードでは:
- mid-session steering = sendMessage
- 権限応答 = respondToPermission（全構造化プロバイダーが対応）

### 権限応答の解決

terminal モードでも CC は MCP 経由で権限制御できる。`match` builder で式として分岐:

```typescript
function handlePermissionResponse(session: AgentSession, requestId: RequestId, decision: PermissionDecision) {
  match("mode", session)
    .case("structured", (s) => s.respondToPermission(requestId, decision))
    .case("terminal", (s) => permissionHandlers.get(s.provider.id)?.(requestId, decision))
    .exhaustive();
}
```

**型の動き:**
1. `match("mode", session)` → `Cases<AgentSession, "mode", AgentSession, never>`
2. `.case("structured", ...)` → `Cases<..., Exclude<AgentSession, {mode:"structured"}>, R1>` = `Cases<..., TerminalSession, R1>`
3. `.case("terminal", ...)` → `Cases<..., never, R1 | R2>`
4. `.exhaustive()` → `[never] extends [never]` = true → 呼べる

`.case("terminal", ...)` を消すと: `Remaining = TerminalSession` → `[TerminalSession] extends [never]` = false → `NonExhaustiveError<TerminalSession>` → `.exhaustive()` がコンパイルエラー。

---

## AgentEvent（discriminated union）

type ごとに payload の型が確定する。`Record<string, unknown>` や `as` キャストは不要。

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

type MessageEvent = {
  type: "message";
  source: EventSource;
  confidence: Confidence;
  payload: {
    role: "assistant" | "user";
    content: string;
  };
};

type ToolUseEvent = {
  type: "tool_use";
  source: EventSource;
  confidence: Confidence;
  payload: {
    tool: string;
    args: {
      file_path?: string;
      command?: string;
      diff?: string;
      [key: string]: unknown;  // エージェントごとに異なる引数を許容
    };
  };
};

type ToolResultEvent = {
  type: "tool_result";
  source: EventSource;
  confidence: Confidence;
  payload: {
    tool: string;
    result?: string;
    error?: string;
  };
};

type PermissionRequestEvent = {
  type: "permission_request";
  source: EventSource;
  confidence: Confidence;
  payload: {
    requestId: RequestId;
    tool: string;
    args: {
      file_path?: string;
      command?: string;
      [key: string]: unknown;  // ツール固有の引数
    };
    description?: string;
  };
};

type CostUpdateEvent = {
  type: "cost_update";
  source: EventSource;
  confidence: Confidence;
  payload: {
    tokens_in: number;
    tokens_out: number;
    cost_usd?: number;
  };
};

type ContextUpdateEvent = {
  type: "context_update";
  source: EventSource;
  confidence: Confidence;
  payload: {
    context_percent: number;
    tokens_used: number;
    tokens_max: number;
  };
};

type ErrorEvent = {
  type: "error";
  source: EventSource;
  confidence: Confidence;
  payload: {
    message: string;
    code?: string;
  };
};
```

**`Record<string, unknown>` の排除**: PermissionRequestEvent の `args` は以前 `Record<string, unknown>` だったが、ToolUseEvent と同じ index signature パターンに統一。既知のキー（file_path, command）は型で明示し、未知のキーは index signature で許容。

**使用例 — match builder（値を返す式）:**

```typescript
// イベントの 1 行サマリを生成
function summarize(event: AgentEvent): string {
  return match("type", event)
    .case("message",            (e) => `${e.payload.role}: ${e.payload.content.slice(0, 80)}`)
    .case("tool_use",           (e) => `${e.payload.tool}(${e.payload.args.file_path ?? ""})`)
    .case("tool_result",        (e) => `${e.payload.tool} → ${e.payload.error ?? "ok"}`)
    .case("permission_request", (e) => `Permission: ${e.payload.tool}`)
    .case("cost_update",        (e) => `${e.payload.tokens_in} in / ${e.payload.tokens_out} out`)
    .case("context_update",     (e) => `ctx ${e.payload.context_percent}%`)
    .case("error",              (e) => e.payload.message)
    .exhaustive();
}
```

**使用例 — 副作用を伴う分岐（match builder）:**

```typescript
// match は副作用にも使える。戻り値を無視するだけ
function handleEvent(event: AgentEvent) {
  match("type", event)
    .case("message",            (e) => console.log(`${e.payload.role}: ${e.payload.content}`))
    .case("permission_request", (e) => showPermissionUI(e.payload.requestId, e.payload.tool))
    .case("tool_use",           (e) => logToolUse(e.payload.tool, e.payload.args))
    .case("tool_result",        () => {})
    .case("cost_update",        () => {})
    .case("context_update",     () => {})
    .case("error",              (e) => showError(e.payload.message))
    .exhaustive();
}
```

---

## AgentProvider（discriminated union）

resume 対応の有無で分岐。optional メソッドを排除。

```typescript
type AgentProvider = ResumableProvider | NonResumableProvider;

type BaseProvider = {
  readonly id: ProviderId;
  readonly name: string;
  readonly mode: "terminal" | "structured";

  check(): Promise<string | null>;
  createSession(config: SessionConfig): AgentSession;
};

type ResumableProvider = BaseProvider & {
  readonly resume: true;
  resumeSession(config: ResumeConfig): AgentSession;
};

type NonResumableProvider = BaseProvider & {
  readonly resume: false;
};
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
// resume 判定（boolean discriminant — if で十分）
if (provider.resume) {
  showResumeButton();
}

// mode 分岐 — match builder で式として
const view = match("mode", provider)
  .case("terminal",   () => <TerminalView />)
  .case("structured", () => <StructuredView />)
  .exhaustive();

// 静的マッピング — satisfies で網羅性チェック
const MODE_LABEL = {
  terminal: "Terminal",
  structured: "Structured",
} satisfies Record<AgentProvider["mode"], string>;
```

---

## SessionConfig / ResumeConfig

```typescript
type SessionConfig = {
  sessionId: SessionId;
  prompt: string;
  projectPath: string;
  worktreePath?: string;
};

type TerminalSessionConfig = SessionConfig & {
  terminalSize: { cols: number; rows: number };
};

type ResumeConfig = {
  sessionId: SessionId;
  agentSessionId: string;  // エージェント側の ID。形式がプロバイダーごとに異なるため string
  projectPath: string;
  worktreePath?: string;
};

type TerminalResumeConfig = ResumeConfig & {
  terminalSize: { cols: number; rows: number };
};
```

terminal プロバイダーは TerminalSessionConfig を受け取る。structured プロバイダーは SessionConfig を受け取る。terminalSize が不要な側に渡らない。

---

## イベント定義

```typescript
type AgentSessionEvents = {
  status: (status: AgentStatus) => void;
  event: (event: AgentEvent) => void;
  exit: (info: ExitInfo) => void;
};

type AgentStatusType = "running" | "waiting_permission" | "idle";

type AgentStatus = {
  status: AgentStatusType;
  confidence: Confidence;
};

type ExitInfo = {
  code: number;
  signal?: string;
  summary?: string;
};

type PermissionDecision = {
  readonly requestId: RequestId;
  readonly approved: boolean;
};
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
  |                      | match("type", event)    |
  |                      |   .case("perm_req", ...) |
  |                      |   .case("cost", ...)     |
  |                      |   .exhaustive()          |
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
// AgentProviderRegistry は意図的拡張点。プラグインシステムの境界。
// interface を使う唯一の正当な理由。
interface AgentProviderRegistry {
  register(provider: AgentProvider): void;
  get(id: ProviderId): AgentProvider | undefined;
  listAvailable(): Promise<AvailableProvider[]>;
}

type AvailableProvider = {
  id: ProviderId;
  name: string;
  mode: "terminal" | "structured";
  resume: boolean;
};
```

**初期化フロー:**

```
1. 全プロバイダーを register()
2. S5 実行開始モーダル表示時に listAvailable()
3. listAvailable() は各プロバイダーの check() を実行し、利用可能なもののみ返す
4. ユーザーが選択 → get(id) → createSession()
```
