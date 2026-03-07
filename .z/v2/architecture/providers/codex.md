# Codex プロバイダー

app-server JSON-RPC 2.0 over stdio。フル構造化制御。
banto の Phase 2 プロバイダー。

上流: `../agent-provider-interface.md`、`../../curation/architecture-decision.md` Section 4

---

## Capabilities

```typescript
{
  terminal: false,
  structuredEvents: true,
  permissions: true,
  resume: true,
  midSessionControl: true,
}
```

---

## プロセス起動

```typescript
class CodexSession implements AgentSession {
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

    // イベントリスナー登録
    this.rpc.on("event", this.handleRpcEvent.bind(this));

    // スレッド開始
    await this.rpc.call("turn/start", {
      prompt,
      model: "codex-1",  // 設定可能に
    });

    this.emit("status", { status: "running", confidence: "high" });
  }
}
```

---

## JSON-RPC 2.0 クライアント

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

        if (msg.id && this.pending.has(msg.id)) {
          // RPC レスポンス
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        } else if (msg.method) {
          // サーバーからのイベント通知
          this.emit("event", msg);
        }
      }
    }
  }
}
```

---

## イベント変換

### Codex app-server イベント → AgentEvent

| Codex イベント | AgentEvent type | payload |
|---------------|----------------|---------|
| TurnStarted | (internal) | ターン開始。status: running を emit |
| Message | message | `{ role: "assistant", content }` |
| ExecCommand | tool_use | `{ tool: "Bash", args: { command } }` |
| ExecCommandResult | tool_result | `{ tool: "Bash", result, error }` |
| FileEdit | tool_use | `{ tool: "Edit", args: { file_path, diff } }` |
| FileRead | tool_use | `{ tool: "Read", args: { file_path } }` |
| ApprovalRequired | permission_request | `{ requestId, tool, args, description }` |
| TurnComplete | (internal) | ターン完了。exit で処理 |
| AgentStatus | status (varies) | Running/Completed/Errored |
| UsageUpdate | cost_update | `{ tokens_in, tokens_out, cost_usd }` |

```typescript
private handleRpcEvent(msg: { method: string; params: unknown }) {
  switch (msg.method) {
    case "Message":
      this.emit("event", {
        type: "message",
        source: "protocol",
        confidence: "high",
        payload: { role: "assistant", content: msg.params.content },
      });
      break;

    case "ApprovalRequired":
      this.emit("event", {
        type: "permission_request",
        source: "protocol",
        confidence: "high",
        payload: {
          requestId: msg.params.id,
          tool: msg.params.tool,
          args: msg.params.args,
          description: msg.params.description,
        },
      });
      this.emit("status", { status: "waiting_permission", confidence: "high" });
      break;

    case "AgentStatus":
      if (msg.params.status === "Completed") {
        // プロセス終了はしない（app-server は生き続ける）
        // banto 側で "done" を設定
      }
      break;

    case "UsageUpdate":
      this.emit("event", {
        type: "cost_update",
        source: "protocol",
        confidence: "high",
        payload: {
          tokens_in: msg.params.input_tokens,
          tokens_out: msg.params.output_tokens,
          cost_usd: msg.params.cost,
        },
      });
      break;

    // ... other events
  }
}
```

---

## 権限応答

```typescript
async respondToPermission(requestId: string, decision: PermissionDecision) {
  if (decision.approved) {
    await this.rpc.call("approval/accept", { id: requestId });
  } else {
    await this.rpc.call("approval/decline", { id: requestId });
  }
}
```

---

## Mid-Session Control

```typescript
async sendMessage(message: string) {
  await this.rpc.call("turn/start", { prompt: message });
}
```

**注意**: `turn/start` は新しいターンを開始する。前のターンが完了している必要がある。実行中に送信する場合の挙動は要検証（→ validation/）。

---

## Resume

```typescript
class CodexProvider implements AgentProvider {
  resumeSession(config: ResumeConfig): AgentSession {
    const session = new CodexSession(config);
    // app-server 起動後にスレッド ID で再開
    session.resumeThreadId = config.agentSessionId;
    return session;
  }
}

// CodexSession.start() 内:
if (this.resumeThreadId) {
  await this.rpc.call("thread/resume", { thread_id: this.resumeThreadId });
} else {
  await this.rpc.call("turn/start", { prompt });
}
```

---

## 停止

```typescript
async stop() {
  // 1. ターンをキャンセル
  await this.rpc.call("turn/cancel", {}).catch(() => {});
  // 2. プロセスを終了
  this.process.kill("SIGTERM");
  // 3. 5 秒猶予後に SIGKILL
  setTimeout(() => this.process.kill("SIGKILL"), 5000);
}
```

---

## app-server 固有の考慮事項

- **プロセスライフサイクル**: app-server はターン間で生き続ける。「セッション完了」= TurnComplete or AgentStatus:Completed であり、プロセス終了ではない。banto 側で明示的にプロセスを kill する。
- **複数ターン**: Codex は 1 セッション内で複数ターンを実行できる。banto では 1 タスク = 1 ターン（最初のプロンプト）を基本とするが、sendMessage() で追加ターンも可能。
- **コンテキスト使用率**: Codex の app-server が context_percent 相当の情報を提供するかは要検証。UsageUpdate にトークン数はあるが、ウィンドウ上限は不明な場合がある。
