# Codex プロバイダー

app-server JSON-RPC 2.0 over stdio (JSONL)。フル構造化制御。`[experimental]`。
banto の Phase 2 プロバイダー。

上流: `../agent-provider-interface.md`（ResumableProvider, StructuredSession, branded types）

---

## Provider 型

```typescript
// ResumableProvider & mode: "structured"
const codexProvider: ResumableProvider = {
  id: ProviderId("codex"),
  name: "Codex",
  mode: "structured",
  resume: true,
  modeSwitching: false,  // Codex does not support plan/build mode switching
  check: () => { ... },
  createSession: (config) => { ... },
  resumeSession: (config) => { ... },
};
```

---

## プロセス起動

```typescript
class CodexSession implements StructuredSession {
  readonly mode = "structured" as const;
  private process: Subprocess;
  private rpc: JsonRpcClient;

  async start(prompt: string) {
    this.process = Bun.spawn(["codex", "app-server"], {
      cwd: this.config.worktreePath ?? this.config.projectPath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this.rpc = new JsonRpcClient(this.process.stdin, this.process.stdout);
    this.rpc.on("notification", this.handleNotification.bind(this));
    this.rpc.on("request", this.handleServerRequest.bind(this));

    // 1. Initialize handshake (required before any other method)
    await this.rpc.call("initialize", {});
    this.rpc.notify("initialized", {});

    // 2. Start thread + turn
    await this.rpc.call("thread/start", {
      cwd: this.config.worktreePath ?? this.config.projectPath,
    });

    await this.rpc.call("turn/start", {
      input: prompt,
      threadId: this.threadId,
    });

    this.emit("status", { status: "running", confidence: "high" });
  }
}
```

---

## JSON-RPC 2.0 クライアント

**Wire format note**: Codex app-server omits `"jsonrpc":"2.0"` on the wire. The client must handle messages without this header. JSONL framing (newline-delimited JSON).

```typescript
class JsonRpcClient extends EventEmitter {
  private requestId = 0;
  private pending = new Map<number, { resolve: Function; reject: Function }>();

  constructor(
    private stdin: WritableStream,
    private stdout: ReadableStream,
  ) {
    super();
    this.startReading();
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const message = JSON.stringify({ jsonrpc: "2.0", method, params, id });

    const writer = this.stdin.getWriter();
    await writer.write(new TextEncoder().encode(message + "\n"));
    writer.releaseLock();

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  notify(method: string, params?: unknown): void {
    const message = JSON.stringify({ jsonrpc: "2.0", method, params });
    const writer = this.stdin.getWriter();
    writer.write(new TextEncoder().encode(message + "\n"));
    writer.releaseLock();
  }

  private async startReading() {
    const reader = this.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line);

        // Response to our request (has id matching a pending call)
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        // Server-initiated request (has id + method, expects response)
        } else if (msg.id != null && msg.method) {
          this.emit("request", msg);
        // Server notification (has method, no id)
        } else if (msg.method) {
          this.emit("notification", msg);
        }
      }
    }
  }

  // Send response to a server-initiated request
  async respond(id: number, result: unknown): Promise<void> {
    const message = JSON.stringify({ jsonrpc: "2.0", id, result });
    const writer = this.stdin.getWriter();
    await writer.write(new TextEncoder().encode(message + "\n"));
    writer.releaseLock();
  }
}
```

---

## イベント変換

### Codex app-server イベント → AgentEvent

| Codex 通知 | AgentEvent type | payload |
|-----------|----------------|---------|
| turn/started | (internal) | ターン開始。status: running を emit |
| turn/completed | (internal) | ターン完了。status に応じて done/failed |
| item/agentMessage/delta | message | `{ role: "assistant", content: delta }` |
| item/commandExecution/outputDelta | tool_result | `{ tool: "Bash", result: delta }` |
| item/fileChange/outputDelta | tool_result | `{ tool: "Edit", result: delta }` |
| item/started (type: command) | tool_use | `{ tool: "Bash", args: { command } }` |
| item/started (type: fileChange) | tool_use | `{ tool: "Edit", args: { file_path } }` |
| thread/tokenUsage/updated | cost_update | `{ tokens_in, tokens_out }` (no cost field; calculated client-side) |
| turn/diff/updated | (internal) | diff stats 更新。diff_summary に保存 |

```typescript
// Server notifications (no response expected)
private handleNotification(msg: { method: string; params: unknown }) {
  const handlers = {
    "turn/started": () => {
      this.turnId = msg.params.turn.id;
      this.emit("status", { status: "running", confidence: "high" });
    },
    "turn/completed": () => {
      const status = msg.params.turn.status;
      if (status === "completed") {
        this.emit("status", { status: "done", confidence: "high" });
      } else {
        this.emit("status", { status: "failed", confidence: "high" });
      }
    },
    "item/agentMessage/delta": () => {
      this.emit("event", {
        type: "message",
        source: "protocol",
        confidence: "high",
        payload: { role: "assistant", content: msg.params.delta },
      } satisfies MessageEvent);
    },
    "thread/tokenUsage/updated": () => {
      const usage = msg.params.tokenUsage.total;
      this.emit("event", {
        type: "cost_update",
        source: "protocol",
        confidence: "high",
        payload: {
          tokens_in: usage.inputTokens,
          tokens_out: usage.outputTokens,
          cost_usd: 0,  // No cost field; calculate client-side from model pricing
        },
      } satisfies CostUpdateEvent);

      // context_percent from modelContextWindow
      if (msg.params.tokenUsage.modelContextWindow) {
        const percent = Math.round(
          (usage.totalTokens / msg.params.tokenUsage.modelContextWindow) * 100
        );
        this.emit("event", {
          type: "context_update",
          source: "protocol",
          confidence: "high",
          payload: { context_percent: percent },
        });
      }
    },
  } satisfies Partial<Record<string, () => void>>;

  handlers[msg.method]?.();
}

// Server-initiated requests (response required)
private async handleServerRequest(msg: { id: number; method: string; params: unknown }) {
  const handlers = {
    "item/commandExecution/requestApproval": async () => {
      const requestId = RequestId(msg.params.itemId);
      this.emit("event", {
        type: "permission_request",
        source: "protocol",
        confidence: "high",
        payload: {
          requestId,
          tool: "Bash",
          args: { command: msg.params.command },
          description: msg.params.reason,
        },
      } satisfies PermissionRequestEvent);
      this.emit("status", { status: "waiting_permission", confidence: "high" });

      const decision = await this.waitForPermissionResponse(requestId);
      return { decision: decision.approved ? "accept" : "decline" };
    },
    "item/fileChange/requestApproval": async () => {
      const requestId = RequestId(msg.params.itemId);
      this.emit("event", {
        type: "permission_request",
        source: "protocol",
        confidence: "high",
        payload: {
          requestId,
          tool: "Write",
          args: {},
          description: msg.params.reason,
        },
      } satisfies PermissionRequestEvent);
      this.emit("status", { status: "waiting_permission", confidence: "high" });

      const decision = await this.waitForPermissionResponse(requestId);
      return { decision: decision.approved ? "accept" : "decline" };
    },
  } satisfies Partial<Record<string, () => Promise<unknown>>>;

  const handler = handlers[msg.method];
  if (handler) return handler();
  return {};
}
```

---

## 権限応答

Codex の権限モデルは **reverse-direction**: エージェントが `item/commandExecution/requestApproval` や `item/fileChange/requestApproval` をリクエストとして送信し、banto がレスポンスで decision を返す。

Decision の選択肢:
- `accept`: 今回だけ許可
- `acceptForSession`: セッション中は許可（auto_approve_rules に相当）
- `decline`: 拒否
- `cancel`: ターンをキャンセル

banto の auto_approve_rules に一致する場合は `acceptForSession` を返す。

---

## Mid-Session Control

```typescript
async sendMessage(message: string) {
  await this.rpc.call("turn/steer", {
    input: message,
    threadId: this.threadId,
    expectedTurnId: this.turnId,
  });
}
```

**注意**: `turn/steer` はアクティブなターンにインプットを注入する。`expectedTurnId` は precondition check。ターンがアクティブでない場合は `turn/start` を使う。

---

## Resume

```typescript
resumeSession(config: ResumeConfig): StructuredSession {
  const session = new CodexSession(config);
  session.resumeThreadId = config.agentSessionId;
  return session;
}

// CodexSession.start() 内:
if (this.resumeThreadId) {
  await this.rpc.call("thread/resume", { threadId: this.resumeThreadId });
} else {
  await this.rpc.call("thread/start", { cwd: this.config.worktreePath ?? this.config.projectPath });
  await this.rpc.call("turn/start", { input: prompt, threadId: this.threadId });
}
```

---

## 停止

```typescript
async stop() {
  await this.rpc.call("turn/interrupt", {
    threadId: this.threadId,
    turnId: this.turnId,
  }).catch(() => {});
  this.process.kill("SIGTERM");
  setTimeout(() => this.process.kill("SIGKILL"), 5000);
}
```

---

## app-server 固有の考慮事項

- **プロセスライフサイクル**: app-server はターン間で生き続ける。「セッション完了」= turn/completed であり、プロセス終了ではない。banto 側で明示的にプロセスを kill する。
- **複数ターン**: Codex は 1 セッション内で複数ターンを実行できる。banto では 1 タスク = 1 ターン（最初のプロンプト）を基本とするが、sendMessage() で追加ターンも可能。
- **コスト計算**: app-server は cost フィールドを提供しない。`thread/tokenUsage/updated` のトークン数とモデル料金テーブルから banto 側で計算する。
- **コンテキスト使用率**: `thread/tokenUsage/updated` に `modelContextWindow` フィールドがある。totalTokens / modelContextWindow で算出。
- **型生成**: `codex app-server generate-ts` で TypeScript 型定義を自動生成可能。
