# Claude Code プロバイダー

PTY 起動、HTTP hooks 統合、hooks 権限制御（PreToolUse + PermissionRequest）、resume。
banto の Phase 1 プロバイダー。

上流: `../agent-provider-interface.md`（ResumableProvider, TerminalSession, branded types）

---

## Provider 型

```typescript
// ResumableProvider & mode: "terminal"
const claudeCodeProvider: ResumableProvider = {
  id: ProviderId("claude-code"),
  name: "Claude Code",
  mode: "terminal",
  resume: true,
  check: () => { ... },
  createSession: (config) => { ... },
  resumeSession: (config) => { ... },
};
```

---

## プロセス起動

```typescript
class ClaudeCodeSession implements TerminalSession {
  readonly mode = "terminal" as const;
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
  }

  private buildArgs(prompt: string): string[] {
    const args = [
      "--print",
      "--session-id", this.config.sessionId,
      "--settings", JSON.stringify(this.settingsConfig()),
      "--output-format", "stream-json",
      "--verbose",
      "--permission-mode", "default",
    ];

    if (this.resumeSessionId) {
      args.push("--resume", this.resumeSessionId);
    } else {
      args.push(prompt);
    }

    return args;
  }
}
```

**注意**: `--print` + `--output-format stream-json` で起動。hooks で構造化イベントを受信し、stream-json で usage/cost/context_window を取得する。

---

## HTTP Hooks

### 設定

```typescript
private settingsConfig() {
  const baseUrl = `http://localhost:${this.serverPort}/api/hooks/claude-code`;
  const sessionParam = `session=${this.config.sessionId}`;
  return {
    hooks: {
      PreToolUse: [{ hooks: [{ type: "http", url: `${baseUrl}?event=pre_tool_use&${sessionParam}` }] }],
      PostToolUse: [{ hooks: [{ type: "http", url: `${baseUrl}?event=post_tool_use&${sessionParam}` }] }],
      PermissionRequest: [{ hooks: [{ type: "http", url: `${baseUrl}?event=permission_request&${sessionParam}` }] }],
      Stop: [{ hooks: [{ type: "http", url: `${baseUrl}?event=stop&${sessionParam}` }] }],
      SessionEnd: [{ hooks: [{ type: "http", url: `${baseUrl}?event=session_end&${sessionParam}` }] }],
      Notification: [{ hooks: [{ type: "http", url: `${baseUrl}?event=notification&${sessionParam}` }] }],
      PreCompact: [{ hooks: [{ type: "http", url: `${baseUrl}?event=pre_compact&${sessionParam}` }] }],
    },
  };
}
```

### Hook イベント → AgentEvent 変換

| CC Hook | 受信データ | 変換先 AgentEvent |
|---------|----------|-----------------|
| PreToolUse | `{ tool_name, tool_input, tool_use_id }` | (権限判定。auto_approve 一致なら `{ permissionDecision: "allow" }` を返す) |
| PostToolUse | `{ tool_name, tool_input, tool_response, tool_use_id }` | event: { type: "tool_result", source: "hook", payload: { tool, result } } |
| PermissionRequest | `{ tool_name, tool_input }` | event: { type: "permission_request", source: "hook", payload: { requestId, tool, args } }. Response: `{ decision: { behavior: "allow" | "deny" } }` |
| Stop | `{ stop_hook_active, last_assistant_message }` | (内部処理。last_assistant_message を agent_summary 候補として記録) |
| SessionEnd | `{ reason }` | (ライフサイクル。プロセス終了を確認) |
| Notification | `{ message, title, notification_type }` | (notification_type に応じて分岐) |
| PreCompact | `{}` | event: { type: "context_update", source: "hook", payload: { compacting: true } } |

### Hook エンドポイント

```typescript
app.post("/api/hooks/claude-code", async ({ query, body }) => {
  const sessionId = SessionId(query.session);
  const eventType = query.event;

  const handlers = {
    pre_tool_use: () => {
      // auto_approve_rules との照合
      if (this.autoApproveRules.matches(sessionId, body)) {
        return { permissionDecision: "allow" };
      }
      return {};  // CC のデフォルト動作（ユーザーに聞く）
    },
    post_tool_use: () => {
      this.emitEvent(sessionId, convertPostToolUse(body));
      return {};
    },
    permission_request: () => {
      // PermissionRequest hook で権限 UI を起動
      const requestId = RequestId(generateId());
      this.emitEvent(sessionId, {
        type: "permission_request",
        source: "hook",
        confidence: "high",
        payload: { requestId, tool: body.tool_name, args: body.tool_input },
      });
      // ユーザー応答を待つ
      const decision = await this.waitForPermissionResponse(requestId);
      return { decision: { behavior: decision.approved ? "allow" : "deny" } };
    },
    stop: () => {
      if (body.last_assistant_message) {
        this.recordAgentSummaryCandidate(sessionId, body.last_assistant_message);
      }
      return {};
    },
    session_end: () => {
      return {};
    },
    notification: () => {
      this.emitEvent(sessionId, convertNotification(body));
      return {};
    },
    pre_compact: () => {
      this.emitEvent(sessionId, {
        type: "context_update",
        source: "hook",
        confidence: "high",
        payload: { compacting: true },
      });
      return {};
    },
  } satisfies Record<string, () => unknown>;

  return handlers[eventType]?.() ?? {};
});
```

---

## 権限制御

CC の権限制御は HTTP hooks で実現する（MCP permission-prompt-tool は存在しない）。

- **PreToolUse**: auto_approve_rules に一致する場合、`{ permissionDecision: "allow" }` を返して自動承認
- **PermissionRequest**: ユーザーに権限判断を求める。banto の権限 UI を表示し、応答を `{ decision: { behavior: "allow" | "deny" } }` で返す

PreToolUse は「事前判定」、PermissionRequest は「ユーザー対話」。banto は両方を使う。

---

## Resume

```typescript
resumeSession(config: TerminalResumeConfig): TerminalSession {
  const session = new ClaudeCodeSession({
    ...config,
    resumeSessionId: config.agentSessionId,
  });
  return session;
}
```

**agent_session_id の取得**: `--session-id` で banto が UUID を指定するため、sessions.agent_session_id = banto 生成の SessionId。hooks の全イベントに `session_id` フィールドが含まれる。

---

## コンテキスト使用率

CC の hooks には context_window 情報が含まれない。`--output-format stream-json` の出力を解析する。

**stream-json の result イベント**:
```json
{
  "type": "result",
  "subtype": "success",
  "total_cost_usd": 0.098998,
  "usage": { "input_tokens": 7, "output_tokens": 162 },
  "modelUsage": {
    "claude-opus-4-6": {
      "inputTokens": 7,
      "outputTokens": 162,
      "costUSD": 0.098998,
      "contextWindow": 200000,
      "maxOutputTokens": 32000
    }
  }
}
```

context_percent の計算:
```typescript
function calculateContextPercent(usage: StreamJsonUsage): number {
  const totalTokens = usage.inputTokens + usage.outputTokens
    + (usage.cacheReadInputTokens ?? 0) + (usage.cacheCreationInputTokens ?? 0);
  return Math.round((totalTokens / usage.contextWindow) * 100);
}
```

**PreCompact hook**: コンテキスト圧縮の前に発火。context_percent が高い段階での警告に使用。

---

## 状態検出の優先度

```
1. HTTP hooks (PreToolUse, PostToolUse, PermissionRequest, Stop, SessionEnd)  → High confidence
2. stream-json output (usage, context_window, cost)                          → High confidence
3. Process exit/signal                                                       → Lifecycle boundary
4. PTY output pattern (last resort)                                          → Low confidence
```

hooks + stream-json が正常動作していれば PTY パースは不要。
