# PTY Fallback プロバイダー

ACP もネイティブプロトコルもサポートしないエージェント用の最終手段。
ターミナル出力からのヒューリスティクスでのみ状態を推測する。

上流: `../agent-provider-interface.md`（NonResumableProvider, TerminalSession, branded types）

---

## Provider 型

```typescript
// NonResumableProvider & mode: "terminal"
const ptyFallbackProvider: NonResumableProvider = {
  id: ProviderId("pty:aider"),
  name: "Aider",
  mode: "terminal",
  resume: false,
  check: () => { ... },
  createSession: (config) => { ... },
};
```

**最低レベルの統合**。ターミナルは見えるが、構造化データはない。

---

## プロセス起動

```typescript
class PtyFallbackSession implements TerminalSession {
  readonly mode = "terminal" as const;
  private process: Subprocess;
  private stateDetector: StateDetector;

  async start(prompt: string) {
    const command = this.agentConfig.command;
    const args = [...this.agentConfig.args, prompt];

    this.process = Bun.spawn([command, ...args], {
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

    this.stateDetector = new StateDetector(this.agentConfig.patterns);
    this.startStateDetection();

    this.emit("status", { status: "running", confidence: "medium" });
  }
}
```

---

## 状態検出

### StateDetector

PTY 出力のパターンマッチングで状態を推測する。
**信頼度は常に low or medium**。false positive を避けるため保守的に判定。

```typescript
type StatePatterns = {
  promptPattern?: RegExp;
  permissionPattern?: RegExp;
  errorPattern?: RegExp;
};

class StateDetector {
  constructor(private patterns: StatePatterns) {}

  analyze(line: string): AgentEvent | AgentStatus | null {
    if (this.patterns.promptPattern?.test(line)) {
      return { status: "idle", confidence: "low" } satisfies AgentStatus;
    }
    if (this.patterns.permissionPattern?.test(line)) {
      return { status: "waiting_permission", confidence: "low" } satisfies AgentStatus;
    }
    if (this.patterns.errorPattern?.test(line)) {
      return {
        type: "error",
        source: "heuristic",
        confidence: "low",
        payload: { message: line.trim() },
      } satisfies ErrorEvent;
    }
    return null;
  }
}
```

**変更点**: `as` キャスト → `satisfies` で型チェック。ランタイム動作は同一だがコンパイル時に型の整合性を保証。

### 設定例

```typescript
type PtyAgentConfig = {
  id: ProviderId;
  name: string;
  command: string;
  args: string[];
  patterns: StatePatterns;
};

const ptyAgentConfigs: PtyAgentConfig[] = [
  {
    id: ProviderId("pty:aider"),
    name: "Aider",
    command: "aider",
    args: [],
    patterns: {
      promptPattern: /^aider>/,
      permissionPattern: /Allow .+\? \(y\/n\)/,
      errorPattern: /^Error:/,
    },
  },
];
```

### 出力解析ループ

```typescript
private startStateDetection() {
  const decoder = new TextDecoder();
  let lineBuffer = "";

  this.process.stdout.pipeTo(new WritableStream({
    write: (chunk) => {
      this.terminalStreamController.enqueue(chunk);

      lineBuffer += decoder.decode(chunk, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const result = this.stateDetector.analyze(line);
        if (result) {
          if ("status" in result) {
            this.emit("status", result);
          } else {
            this.emit("event", result);
          }
        }
      }
    },
  }));
}
```

---

## 権限ハンドリング

TerminalSession には respondToPermission がない。S7 構造化権限 UI は使えない。

**ユーザーの操作**: ターミナルパネルで直接 `y` や `n` を入力する。PTY write で送信される。

StateDetector が permissionPattern を検出した場合:
- status: waiting_permission（confidence: low）が emit される
- S1 ダッシュボードの Needs Attention に表示される
- ただし [Approve] [Deny] ボタンは表示しない（API がないため）
- カードに「ターミナルで応答してください」と表示

---

## 制限事項

| 制限 | 理由 | 対処 |
|------|------|------|
| structured events なし | プロトコルがない | タイムラインは最小限（状態変化のみ） |
| permissions API なし | プロトコルがない | ターミナルで直接操作 |
| resume 不可 | セッション ID を取得できない | Retry のみ |
| 状態検出の信頼度が低い | ヒューリスティクスは脆い | confidence: low。UI で「推測」と表示 |
| CLI アップデートで壊れる | パターンが変わる | 設定ファイルでパターンを外出し |

---

## このプロバイダーを使うべきでないケース

- エージェントが ACP をサポートしている → ACP プロバイダーを使う
- エージェントにネイティブプロトコルがある → 専用プロバイダーを作る

PTY Fallback は**最終手段**。ACP の普及により、このプロバイダーの利用頻度は下がることを期待する。
