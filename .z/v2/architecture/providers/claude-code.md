# Claude Code プロバイダー

PTY 起動、HTTP hooks 統合、MCP 権限制御、resume。
banto の Phase 1 プロバイダー。

上流: `../agent-provider-interface.md`、`../../curation/architecture-decision.md` Section 4

---

## Capabilities

```typescript
{
  terminal: true,
  structuredEvents: true,
  permissions: true,
  resume: true,
  midSessionControl: true,
}
```

---

## プロセス起動

```typescript
class ClaudeCodeSession implements AgentSession {
  private process: Subprocess;

  async start(prompt: string) {
    this.process = Bun.spawn(["claude", ...this.buildArgs(prompt)], {
      cwd: this.config.worktreePath ?? this.config.projectPath,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // PTY ストリームのセットアップは Bun.Terminal 経由
    // (具体的 API は Bun のバージョンによる)
  }

  private buildArgs(prompt: string): string[] {
    const args = [
      "--print",  // 非対話モードで出力
    ];

    // Hooks 設定
    args.push("--hook-config", JSON.stringify(this.hookConfig()));

    // MCP 設定（権限制御）
    args.push("--mcp-config", JSON.stringify(this.mcpConfig()));
    args.push("--permission-prompt-tool", "mcp__banto__permission_prompt");

    // Resume の場合
    if (this.resumeSessionId) {
      args.push("--resume", this.resumeSessionId);
    }

    // プロンプト
    args.push(prompt);

    return args;
  }
}
```

**注意**: `--print` vs 対話モード。v1 では対話 TUI モードで起動していたが、hooks + MCP を使う場合は `--print` の方が安定する可能性がある。PoC で検証（→ `../../../validation/` で扱う）。

---

## HTTP Hooks

### 設定

```typescript
private hookConfig() {
  const baseUrl = `http://localhost:${this.serverPort}/api/hooks/claude-code`;
  return {
    hooks: {
      Notification: [{ type: "http", url: `${baseUrl}?event=notification&session=${this.sessionId}` }],
      Stop: [{ type: "http", url: `${baseUrl}?event=stop&session=${this.sessionId}` }],
      PreToolUse: [{ type: "http", url: `${baseUrl}?event=pre_tool_use&session=${this.sessionId}` }],
      PostToolUse: [{ type: "http", url: `${baseUrl}?event=post_tool_use&session=${this.sessionId}` }],
    },
  };
}
```

### Hook イベント → AgentEvent 変換

| CC Hook | 受信データ | 変換先 AgentEvent |
|---------|----------|-----------------|
| Notification (idle) | `{ type: "notification", event: "idle" }` | status: { status: "idle", confidence: "high" } |
| Notification (tool_use) | `{ type: "notification", tool_name, ... }` | event: { type: "tool_use", source: "hook", payload: { tool, args } } |
| Stop | `{ type: "stop", reason }` | (内部処理。プロセス終了を待つ) |
| PreToolUse | `{ tool_name, tool_input }` | (判定用。基本 `{ "decision": "approve" }` を返す) |
| PostToolUse | `{ tool_name, tool_input, tool_output }` | event: { type: "tool_result", source: "hook", payload: { tool, result } } |

### Hook エンドポイント

```typescript
// src/server/agents/claude-code/hooks.ts
app.post("/api/hooks/claude-code", async ({ query, body }) => {
  const sessionId = query.session;
  const eventType = query.event;

  switch (eventType) {
    case "notification":
      // AgentEvent に変換して SessionRunner に伝播
      this.emitEvent(sessionId, convertNotification(body));
      return { status: "ok" };

    case "pre_tool_use":
      // 基本は approve。auto_approve_rules の照合は SessionRunner 側で行う。
      // ここでは CC に「実行してよい」と返すだけ。
      // banto の権限制御は MCP permission-prompt-tool で行う。
      return { decision: "approve" };

    case "post_tool_use":
      this.emitEvent(sessionId, convertPostToolUse(body));
      return { status: "ok" };

    case "stop":
      // プロセス終了通知。exit イベントは process.on("exit") で別途捕捉。
      return { status: "ok" };
  }
});
```

---

## MCP 権限制御

### banto MCP サーバー

Claude Code が `--permission-prompt-tool mcp__banto__permission_prompt` で起動されると、権限が必要な操作の前に banto の MCP ツールを呼ぶ。

```typescript
// src/server/agents/claude-code/mcp-permission.ts

// MCP サーバーとして登録するツール
const permissionPromptTool = {
  name: "permission_prompt",
  description: "Request permission from the user for a tool execution",
  parameters: {
    tool_name: { type: "string" },
    tool_input: { type: "object" },
    description: { type: "string" },
  },

  async execute({ tool_name, tool_input, description }, { sessionId }) {
    const requestId = generateId();

    // 1. AgentEvent として emit（SessionRunner が通知生成 + WS push）
    this.emitEvent(sessionId, {
      type: "permission_request",
      source: "mcp",
      confidence: "high",
      payload: { requestId, tool: tool_name, args: tool_input, description },
    });

    // 2. ユーザーの応答を待つ（Promise）
    const decision = await this.waitForPermissionResponse(requestId);

    // 3. CC に返す
    return { approved: decision.approved };
  },
};
```

### 応答待ち

```typescript
class PermissionWaiter {
  private pending = new Map<string, {
    resolve: (d: PermissionDecision) => void;
  }>();

  wait(requestId: string): Promise<PermissionDecision> {
    return new Promise(resolve => {
      this.pending.set(requestId, { resolve });
    });
  }

  respond(requestId: string, decision: PermissionDecision) {
    const waiter = this.pending.get(requestId);
    if (waiter) {
      waiter.resolve(decision);
      this.pending.delete(requestId);
    }
  }
}
```

タイムアウトなし。ユーザーが応答するまで待つ。Claude Code 側も待ち続ける。

---

## Resume

```typescript
async resumeSession(config: ResumeConfig): AgentSession {
  // --resume フラグ付きで起動
  const session = new ClaudeCodeSession({
    ...config,
    resumeSessionId: config.agentSessionId,
  });
  return session;
}
```

**agent_session_id の取得**: Claude Code のセッション ID は hooks の Notification イベントに含まれる。初回起動時に記録し、sessions.agent_session_id に保存。

---

## コンテキスト使用率

Claude Code の hooks Notification に context 情報が含まれる場合:

```typescript
function convertNotification(body: any): AgentEvent {
  if (body.context_window) {
    return {
      type: "context_update",
      source: "hook",
      confidence: "high",
      payload: {
        context_percent: Math.round(
          (body.context_window.used / body.context_window.total) * 100
        ),
        tokens_used: body.context_window.used,
        tokens_max: body.context_window.total,
      },
    };
  }
  // ... other notification types
}
```

**注意**: CC の hooks API が context_window を提供するかは要検証（→ validation/）。提供しない場合は PTY 出力からのヒューリスティクスか、stream-json の usage フィールドから取得。

---

## 状態検出の優先度

```
1. HTTP hooks (Notification, PostToolUse)  → High confidence
2. MCP permission callback                → High confidence
3. Process exit/signal                    → Lifecycle boundary
4. PTY output pattern (last resort)       → Low confidence
```

PTY パース例（fallback のみ）:
- `⏳` + `Permission required` → waiting_permission（低信頼度）
- プロンプト文字列の検出 → idle（低信頼度）

hooks + MCP が正常動作していれば PTY パースは不要。
