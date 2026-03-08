# ACP プロバイダー

ACP (Agent Client Protocol) JSON-RPC 2.0 over stdio。universal fallback。
28+ エージェント対応。TypeScript SDK (`@agentclientprotocol/sdk`) を使用。
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
  modeSwitching: false,  // Determined dynamically via ACP session/set_mode capability
  check: () => { ... },
  createSession: (config) => { ... },
};
```

**resume は動的**: ACP のネゴシエーションで agent が resume 対応を宣言した場合のみ true に変更。

---

## ACP 概要

ACP は Zed が策定した "LSP for agents" プロトコル。JSON-RPC 2.0 over stdio (newline-delimited JSON)。

- 公式サイト: agentclientprotocol.com
- Protocol version: 1 (単一整数。破壊的変更時のみインクリメント)
- 28+ エージェント対応: Gemini CLI, OpenCode, Goose, Kiro, Copilot CLI, Cline, Qwen Code, etc.
- TypeScript SDK: `@agentclientprotocol/sdk` v0.14.1
- CC/Codex はアダプター経由で ACP 対応（ネイティブではない）

---

## プロセス起動

```typescript
class AcpSession implements StructuredSession {
  readonly mode = "structured" as const;
  private process: Subprocess;
  private connection: ClientSideConnection;  // from @agentclientprotocol/sdk

  async start(prompt: string) {
    this.process = Bun.spawn(this.buildCommand(), {
      cwd: this.config.worktreePath ?? this.config.projectPath,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // SDK handles JSON-RPC framing, capability negotiation, message routing
    this.connection = new ClientSideConnection(
      this.process.stdin,
      this.process.stdout,
    );

    // Register client-side handlers (agent -> client requests)
    this.connection.onRequest("session/request_permission", this.handlePermissionRequest.bind(this));
    this.connection.onNotification("session/update", this.handleSessionUpdate.bind(this));

    // 1. Initialize (capability negotiation)
    const initResult = await this.connection.initialize({
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: false },
      },
      clientInfo: { name: "banto", version: "2.0.0" },
    });

    this.agentCapabilities = initResult.agentCapabilities;

    // 2. Create session
    const session = await this.connection.request("session/new", {});
    this.acpSessionId = session.sessionId;

    // 3. Send prompt
    await this.connection.request("session/prompt", {
      sessionId: this.acpSessionId,
      parts: [{ type: "text", text: prompt }],
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

| ACP メソッド | 方向 | AgentEvent type | payload |
|-------------|------|----------------|---------|
| session/update (agent_message_chunk) | notification | message | `{ role: "assistant", content: chunk }` |
| session/update (tool_call) | notification | tool_use | `{ tool, args }` (status: pending→in_progress→completed) |
| session/update (tool_call_update) | notification | tool_result | `{ tool, result }` |
| session/request_permission | request | permission_request | `{ requestId, tool, args, options }` |
| session/prompt response | response | (internal) | `{ stopReason }` (end_turn/cancelled/etc.) |

**注意**: ACP には `context/updated` と `usage/updated` がない。トークン/コスト追跡は agent 固有の extNotification に依存（標準化されていない）。

```typescript
private handleSessionUpdate(params: { sessionId: string; update: AcpUpdate }) {
  const update = params.update;

  const handlers: Record<string, () => void> = {
    agent_message_chunk: () => {
      this.emit("event", {
        type: "message",
        source: "protocol",
        confidence: "high",
        payload: { role: "assistant", content: update.chunk },
      });
    },
    tool_call: () => {
      if (update.status === "pending") {
        this.emit("event", {
          type: "tool_use",
          source: "protocol",
          confidence: "high",
          payload: { tool: update.toolName, args: update.input },
        });
      }
    },
    tool_call_update: () => {
      this.emit("event", {
        type: "tool_result",
        source: "protocol",
        confidence: "high",
        payload: { tool: update.toolName, result: update.output },
      });
    },
  };

  handlers[update.type]?.();
}
```

---

## 権限応答

Permission is handled as a JSON-RPC response to `session/request_permission` (request-response pattern, not a separate RPC call).

```typescript
private async handlePermissionRequest(params: {
  sessionId: string;
  toolCall: unknown;
  options: Array<{ optionId: string; name: string; kind: string }>;
}) {
  const requestId = RequestId(generateId());
  this.emit("event", {
    type: "permission_request",
    source: "protocol",
    confidence: "high",
    payload: {
      requestId,
      tool: params.toolCall.name,
      args: params.toolCall.input,
      description: params.toolCall.name,
    },
  });
  this.emit("status", { status: "waiting_permission", confidence: "high" });

  const decision = await this.waitForPermissionResponse(requestId);
  const optionId = decision.approved
    ? params.options.find(o => o.kind === "allow_once")?.optionId
    : params.options.find(o => o.kind === "reject_once")?.optionId;

  return { outcome: { outcome: "selected", optionId } };
}
```

---

## Mode Switching

ACP supports `session/set_mode` as an optional capability. Agents like OpenCode expose "ask" (plan) and "code" (build) modes.

```typescript
async switchMode(mode: AgentMode): Promise<void> {
  const acpMode = mode === "plan" ? "ask" : "code";
  await this.connection.request("session/set_mode", {
    sessionId: this.acpSessionId,
    mode: acpMode,
  });
  this.emit("modeSwitched", mode);
}
```

**Dynamic capability**: `modeSwitching` is determined after `initialize` by checking if the agent's capabilities include session mode support. The ACP registry or agent config can override this.

---

## Mid-Session Control

```typescript
async sendMessage(message: string) {
  await this.connection.request("session/prompt", {
    sessionId: this.acpSessionId,
    parts: [{ type: "text", text: message }],
  });
}
```

---

## 停止

ACP には `shutdown` RPC は存在しない。`session/cancel` notification + SIGTERM で停止。

```typescript
async stop() {
  this.connection.notify("session/cancel", { sessionId: this.acpSessionId });
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

## ACP 仕様の検証状況

| 項目 | 状態 | 対策 |
|------|------|------|
| initialize の capabilities 仕様 | 検証済み | `agentCapabilities` で resume/loadSession/promptCapabilities を確認 |
| context/updated イベント | 仕様に存在しない | extNotification で agent 固有に対応。context_percent = null が基本 |
| resume 対応 | `sessionCapabilities.resume` で判定 | 対応エージェントのみ。`session/resume` (unstable) を使用 |
| 複数ターンの挙動 | `session/prompt` で追加ターン | 前ターン完了後に送信 |
| トークン/コスト追跡 | 標準化されていない | extNotification の `thread/tokenUsage/updated` を試行的に listen |
