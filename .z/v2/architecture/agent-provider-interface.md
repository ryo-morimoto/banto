# Agent Provider Interface

AgentProvider / AgentSession / AgentCapabilities の型定義、メソッド契約、イベント分類。
全プロバイダーが準拠する抽象。個別プロバイダーの実装詳細は `providers/` を参照。

上流: `../../curation/architecture-decision.md` Section 4

---

## 型定義

### AgentCapabilities

プロバイダーが宣言する能力。UI の表示モード分岐と操作の可否を決定する。

```typescript
interface AgentCapabilities {
  /** PTY 出力をブラウザにリレーできるか */
  terminal: boolean;
  /** 型付きイベント（tool_use, message 等）を emit するか */
  structuredEvents: boolean;
  /** 権限リクエストをプログラム的に処理できるか */
  permissions: boolean;
  /** クラッシュ後にセッションを再開できるか */
  resume: boolean;
  /** 実行中にユーザーからメッセージを送信できるか */
  midSessionControl: boolean;
}
```

**プロバイダー別の値:**

| Capability | Claude Code | Codex | ACP | PTY Fallback |
|-----------|-------------|-------|-----|-------------|
| terminal | true | false | false | true |
| structuredEvents | true | true | true | false |
| permissions | true | true | true | false |
| resume | true | true | agent 依存 | false |
| midSessionControl | true | true | true | true |

**UI への影響:**

| Capability | true のとき | false のとき |
|-----------|------------|-------------|
| terminal | S3 でターミナルパネル表示 | S3 で構造化会話パネル表示 |
| structuredEvents | タイムラインにリッチイベント表示 | タイムラインなし or 最小限 |
| permissions | S7 構造化権限 UI | ユーザーがターミナルで直接操作 |
| resume | 失敗時に「Resume」ボタン表示 | 「Retry」のみ |
| midSessionControl | terminal: メッセージ入力可 / structured: Send ボタン | 入力不可 |

---

### AgentProvider

プロバイダーの登録単位。AgentSession を生成するファクトリ。

```typescript
interface AgentProvider {
  /** 一意識別子。DB の agent_provider カラムに保存される */
  readonly id: string;

  /** UI 表示名 */
  readonly name: string;

  /** このプロバイダーの能力 */
  readonly capabilities: AgentCapabilities;

  /**
   * エージェントが利用可能か確認する。
   * バイナリの存在確認、バージョンチェック等。
   * @returns null = 利用可能, string = 利用不可の理由
   */
  check(): Promise<string | null>;

  /**
   * 新しいセッションを生成する。
   * プロセスの spawn はまだ行わない。start() で開始。
   */
  createSession(config: SessionConfig): AgentSession;

  /**
   * 既存セッションを再開する（resume 対応プロバイダーのみ）。
   * capabilities.resume = false の場合は呼び出し不可。
   */
  resumeSession?(config: ResumeConfig): AgentSession;
}
```

### SessionConfig

```typescript
interface SessionConfig {
  /** banto 内部のセッション ID */
  sessionId: string;

  /** タスクのタイトル + 説明から構成されたプロンプト */
  prompt: string;

  /** プロジェクトのリポジトリパス */
  projectPath: string;

  /** Git ワークツリーパス（メインリポジトリと異なる場合） */
  worktreePath?: string;

  /** 初期ターミナルサイズ（terminal: true の場合のみ使用） */
  terminalSize?: { cols: number; rows: number };
}
```

### ResumeConfig

```typescript
interface ResumeConfig {
  /** banto 内部のセッション ID */
  sessionId: string;

  /** エージェント側のセッション/スレッド ID */
  agentSessionId: string;

  /** プロジェクトのリポジトリパス */
  projectPath: string;

  /** Git ワークツリーパス */
  worktreePath?: string;

  /** 初期ターミナルサイズ */
  terminalSize?: { cols: number; rows: number };
}
```

---

### AgentSession

実行中のエージェントセッション。プロバイダーが生成し、SessionRunner が管理する。

```typescript
interface AgentSession extends EventEmitter<AgentSessionEvents> {
  /** プロバイダー参照 */
  readonly provider: AgentProvider;

  // --- Lifecycle（全プロバイダー必須） ---

  /**
   * エージェントプロセスを起動し、プロンプトを送信する。
   * 成功すると "status" イベントで running が emit される。
   * 失敗すると Promise が reject される（spawn 失敗）。
   */
  start(prompt: string): Promise<void>;

  /**
   * エージェントを停止する。
   * SIGTERM → 猶予後 SIGKILL。
   * "exit" イベントが emit される。
   */
  stop(): Promise<void>;

  /**
   * リソースを解放する。
   * PTY close、プロセス cleanup、イベントリスナー除去。
   * stop() 後 or exit 後に呼ぶ。
   */
  dispose(): void;

  // --- Terminal（capabilities.terminal = true のみ） ---

  /**
   * PTY 出力のバイトストリーム。
   * WebSocket 経由でクライアントにリレーされる。
   */
  readonly terminalStream?: ReadableStream<Uint8Array>;

  /**
   * PTY にデータを書き込む（ユーザー入力）。
   * F4: Mid-Session Steering のターミナルモード。
   */
  writeTerminal?(data: Uint8Array): void;

  /**
   * PTY のサイズを変更する。
   * クライアント側のリサイズに追従。
   */
  resizeTerminal?(cols: number, rows: number): void;

  // --- Structured Control（capabilities 依存） ---

  /**
   * 実行中のエージェントにメッセージを送信する。
   * capabilities.midSessionControl = true かつ terminal = false のとき使用。
   * F4: Mid-Session Steering の構造化モード。
   */
  sendMessage?(message: string): Promise<void>;

  /**
   * 権限リクエストに応答する。
   * capabilities.permissions = true のとき使用。
   */
  respondToPermission?(requestId: string, decision: PermissionDecision): Promise<void>;
}
```

---

### イベント定義

```typescript
interface AgentSessionEvents {
  /**
   * エージェントのステータスが変化した。
   * SessionRunner がこれを受けて sessions テーブルを更新する。
   */
  status: (status: AgentStatus) => void;

  /**
   * 構造化イベントが発生した。
   * SessionRunner がこれを受けて session_events に INSERT する。
   */
  event: (event: AgentEvent) => void;

  /**
   * エージェントプロセスが終了した。
   * stop() による停止、正常終了、異常終了すべてでこれが emit される。
   */
  exit: (info: ExitInfo) => void;
}
```

### AgentStatus

```typescript
type AgentStatusType =
  | "running"
  | "waiting_permission"
  | "idle";

interface AgentStatus {
  status: AgentStatusType;
  confidence: "high" | "medium" | "low";
}
```

**注意**: `pending`, `done`, `failed` は AgentSession が emit しない。これらは SessionRunner がライフサイクル管理として設定する。

- `pending`: createSession() 後、start() 前
- `done`: exit イベント + exit_code === 0
- `failed`: exit イベント + exit_code !== 0、または spawn 失敗

### AgentEvent

```typescript
type AgentEventType =
  | "message"
  | "tool_use"
  | "tool_result"
  | "permission_request"
  | "cost_update"
  | "context_update"
  | "error";

interface AgentEvent {
  type: AgentEventType;
  source: "hook" | "protocol" | "mcp" | "process" | "heuristic";
  confidence: "high" | "medium" | "low";
  payload: Record<string, unknown>;
}
```

**イベント型ごとの payload:**

| type | payload | 例 |
|------|---------|-----|
| message | `{ role: "assistant", content: string }` | `{ role: "assistant", content: "Reading src/auth.ts..." }` |
| tool_use | `{ tool: string, args: Record<string, unknown> }` | `{ tool: "Read", args: { file_path: "src/auth.ts" } }` |
| tool_result | `{ tool: string, result?: string, error?: string }` | `{ tool: "Read", result: "..." }` |
| permission_request | `{ requestId: string, tool: string, args: Record<string, unknown>, description?: string }` | `{ requestId: "abc", tool: "Write", args: { file_path: "package.json" }, description: "Add zod" }` |
| cost_update | `{ tokens_in: number, tokens_out: number, cost_usd?: number }` | `{ tokens_in: 14000, tokens_out: 9000, cost_usd: 0.12 }` |
| context_update | `{ context_percent: number, tokens_used: number, tokens_max: number }` | `{ context_percent: 78, tokens_used: 156000, tokens_max: 200000 }` |
| error | `{ message: string, code?: string }` | `{ message: "Rate limited", code: "RATE_LIMIT" }` |

### PermissionDecision

```typescript
interface PermissionDecision {
  requestId: string;
  approved: boolean;
}
```

### ExitInfo

```typescript
interface ExitInfo {
  code: number;
  signal?: string;
  /** エージェントが出力した最終サマリー（あれば） */
  summary?: string;
}
```

---

## メソッド契約

### start()

| 前提条件 | 事後条件 |
|---------|---------|
| セッションが未開始 | プロセスが起動し、"status: running" が emit される |
| prompt が空でない | terminal: true の場合、terminalStream が読み取り可能になる |
| projectPath が存在する | 失敗時は Promise が reject（"exit" は emit されない） |

**呼び出し回数**: 1 セッションにつき 1 回。再呼び出し不可。

### stop()

| 前提条件 | 事後条件 |
|---------|---------|
| start() 済み | SIGTERM 送信 → 5 秒猶予 → SIGKILL |
| プロセスが生存中 | "exit" イベントが emit される |

**冪等**: プロセスが既に終了していても安全に呼べる。

### respondToPermission()

| 前提条件 | 事後条件 |
|---------|---------|
| capabilities.permissions = true | 応答がエージェントに送信される |
| requestId が有効 | approved: true → エージェント続行、false → エージェントがスキップ/中止 |

**タイムアウト**: banto 側でタイムアウトは設けない。エージェントが待ち続ける限り待つ。

### dispose()

| 前提条件 | 事後条件 |
|---------|---------|
| なし | 全リソース解放。PTY close。イベントリスナー除去 |

**呼び出しタイミング**: exit イベント後、または stop() の完了後。

---

## SessionRunner との関係

AgentSession はエージェントプロセスの薄いラッパー。ビジネスロジック（DB 書き込み、通知生成、WebSocket push）は SessionRunner が担当する。

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
| PTY I/O | yes | no（ストリームを WS にパイプするだけ） |
| プロトコル解析（JSON-RPC 等） | yes | no |
| 型付きイベント emit | yes | no |
| DB 書き込み | no | yes |
| 通知生成 | no | yes |
| WebSocket push | no | yes |
| auto_approve_rules 照合 | no | yes |
| diff_summary / agent_summary 取得 | no | yes（exit 後に git diff 実行） |
| scrollback 永続化 | no | yes |

---

## Provider Registry

```typescript
interface AgentProviderRegistry {
  /** プロバイダーを登録する */
  register(provider: AgentProvider): void;

  /** ID でプロバイダーを取得する */
  get(id: string): AgentProvider | undefined;

  /** 利用可能なプロバイダー一覧を返す（check() を実行済み） */
  listAvailable(): Promise<AvailableProvider[]>;
}

interface AvailableProvider {
  id: string;
  name: string;
  capabilities: AgentCapabilities;
}
```

**起動時の初期化フロー:**

```
1. 全プロバイダーを register()
2. S5 実行開始モーダル表示時に listAvailable() を呼ぶ
3. listAvailable() は各プロバイダーの check() を実行し、利用可能なもののみ返す
4. ユーザーが選択 → get(id) → createSession()
```
