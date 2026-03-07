# ACP プロバイダー

ACP (Agent Client Protocol) JSON-RPC 2.0 over stdio。universal fallback。
banto の Phase 3 プロバイダー。

上流: `../agent-provider-interface.md`（AgentProvider discriminated union, StructuredSession, branded types）

---

## Provider 型

ACP は resume 対応がエージェント依存。初期値は NonResumableProvider として登録し、initialize 後に動的に判定。

```typescript
// 初期値: NonResumableProvider & mode: "structured"
// ネゴシエーション後に resume 対応が判明した場合は ResumableProvider として振る舞う
const acpProvider: NonResumableProvider = {
  id: ProviderId("acp:opencode"),
  name: "OpenCode",
  mode: "structured",
  resume: false,
  check: () => { ... },
  createSession: (config) => { ... },
};
```

**resume は動的**: ACP のネゴシエーションで agent が resume 対応を宣言した場合のみ true に変更。

---

## ACP 概要

ACP は Zed が策定した "LSP for agents" プロトコル。JSON-RPC 2.0 over stdio。

- クライアント（banto）がエージェントプロセスを起動し、stdio で通信
- エージェントがイベントを push し、banto がリクエストを送る
- 7+ エージェント対応: OpenCode, Gemini CLI, Goose, Kiro, Copilot, etc.

---

## プロセス起動

```typescript
class AcpSession implements StructuredSession {
  readonly mode = "structured" as const;
  private process: Subprocess;
  private rpc: JsonRpcClient;  // Codex と同じ JSON-RPC クライアントを共用

  async start(prompt: string) {
    this.process = Bun.spawn(this.buildCommand(), {
      cwd: this.config.worktreePath ?? this.config.projectPath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    this.rpc = new JsonRpcClient(this.process.stdin, this.process.stdout);
    this.rpc.on("event", this.handleAcpEvent.bind(this));

    // 1. Initialize（capability ネゴシエーション）
    const initResult = await this.rpc.call("initialize", {
      clientInfo: { name: "banto", version: "2.0.0" },
      capabilities: {
        permissions: true,
        contextTracking: true,
      },
    });

    // agent が宣言した capabilities を記録
    this.agentCapabilities = initResult.capabilities;

    // 2. メッセージ送信
    await this.rpc.call("message/send", {
      content: prompt,
    });

    this.emit("status", { status: "running", confidence: "high" });
  }

  private buildCommand(): string[] {
    return [this.agentConfig.command, ...this.agentConfig.args];
  }
}
```

---

## ACP イベント → AgentEvent 変換

ACP のイベントは標準化されているため、エージェントに依存しない変換が可能。

| ACP イベント | AgentEvent type | payload |
|-------------|----------------|---------|
| message/created | message | `{ role, content }` |
| tool/called | tool_use | `{ tool, args }` |
| tool/result | tool_result | `{ tool, result, error }` |
| permission/requested | permission_request | `{ requestId: RequestId, tool, args, description }` |
| status/changed | status | `{ status, confidence: "high" }` |
| usage/updated | cost_update | `{ tokens_in, tokens_out, cost_usd }` |
| context/updated | context_update | `{ context_percent }` |
| error | error | `{ message, code }` |
| completed | (exit handling) | セッション完了 |

```typescript
private handleAcpEvent(msg: { method: string; params: unknown }) {
  const eventMap: Record<string, () => AgentEvent | null> = {
    "message/created": () => ({
      type: "message",
      source: "protocol",
      confidence: "high",
      payload: { role: msg.params.role, content: msg.params.content },
    }) satisfies MessageEvent,

    "tool/called": () => ({
      type: "tool_use",
      source: "protocol",
      confidence: "high",
      payload: { tool: msg.params.name, args: msg.params.arguments },
    }) satisfies ToolUseEvent,

    "permission/requested": () => {
      this.emit("status", { status: "waiting_permission", confidence: "high" });
      return {
        type: "permission_request",
        source: "protocol",
        confidence: "high",
        payload: {
          requestId: RequestId(msg.params.id),
          tool: msg.params.tool,
          args: msg.params.arguments,
          description: msg.params.reason,
        },
      } satisfies PermissionRequestEvent;
    },

    // ... etc
  };

  const converter = eventMap[msg.method];
  if (converter) {
    const event = converter();
    if (event) this.emit("event", event);
  }
}
```

---

## 権限応答

```typescript
async respondToPermission(requestId: RequestId, decision: PermissionDecision) {
  await this.rpc.call("permission/respond", {
    id: requestId,
    approved: decision.approved,
  });
}
```

---

## Mid-Session Control

```typescript
async sendMessage(message: string) {
  await this.rpc.call("message/send", { content: message });
}
```

---

## 停止

```typescript
async stop() {
  await this.rpc.call("shutdown", {}).catch(() => {});
  this.process.kill("SIGTERM");
  setTimeout(() => this.process.kill("SIGKILL"), 5000);
}
```

---

## プロバイダー登録

ACP は汎用プロバイダー。各エージェントは設定ファイルで登録:

```typescript
type AcpAgentConfig = {
  id: ProviderId;     // e.g. ProviderId("acp:opencode")
  name: string;       // "OpenCode"
  command: string;    // "opencode"
  args: string[];     // ["--acp"]
};

// registry.ts
for (const config of acpConfigs) {
  registry.register(new AcpProvider(config));
}
```

**provider.id の命名規則**: `acp:<agent-name>`。DB の agent_provider カラムに保存。

### check()

```typescript
async check(): Promise<string | null> {
  try {
    const result = Bun.spawnSync([this.config.command, "--version"]);
    if (result.exitCode !== 0) return `${this.config.command} not found`;
    return null;
  } catch {
    return `${this.config.command} not available`;
  }
}
```

---

## ACP 仕様の不確実性

ACP は 2026 年初頭時点でまだ発展中。以下は要検証（→ validation/）:

| 項目 | 不確実性 | フォールバック |
|------|---------|-------------|
| initialize の capabilities 仕様 | 標準化途上 | 最小限の capabilities を仮定 |
| context/updated イベントの有無 | エージェント依存 | なければ context_percent = null |
| resume 対応 | エージェント依存 | なければ resume = false |
| 複数ターンの挙動 | エージェント依存 | message/send の応答を待つ |
| エラーコードの標準化 | 途上 | 汎用エラーハンドリング |
