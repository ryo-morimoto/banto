# ターミナルリレー

サーバー側 PTY 管理、WebSocket バイナリプロトコル、Ring Buffer、クライアント描画。
terminal: true のプロバイダー（Claude Code, PTY Fallback）で使用。

上流: `agent-provider-interface.md` (terminalStream)、`api-routes.md` (/ws/terminal/:sessionId)

---

## アーキテクチャ

```
AgentSession           SessionRunner          WebSocket           Browser
  |                       |                     |                   |
  | terminalStream        |                     |                   |
  | (ReadableStream)      |                     |                   |
  +---------------------->|                     |                   |
  |                       | pipe to ring buffer |                   |
  |                       | +                   |                   |
  |                       | pipe to WS (if connected)               |
  |                       +-------------------->|                   |
  |                       |                     | binary frame      |
  |                       |                     +------------------>|
  |                       |                     |                   | restty / xterm.js
  |                       |                     |                   | render
  |                       |                     |                   |
  |                       |                     | binary frame      |
  |                       |                     |<------------------+
  |                       | writeTerminal(data) |                   | user input
  |                       |<--------------------+                   |
  | writeTerminal(data)   |                     |                   |
  |<----------------------+                     |                   |
  |                       |                     |                   |
  |                       |                     | JSON: resize      |
  |                       |                     |<------------------+
  |                       | resizeTerminal()    |                   |
  |                       |<--------------------+                   |
  | resizeTerminal()      |                     |                   |
  |<----------------------+                     |                   |
```

---

## サーバー側

### TerminalRelay クラス

セッションごとに 1 インスタンス。

```typescript
class TerminalRelay {
  private ringBuffer: RingBuffer;
  private wsClients = new Set<WebSocket>();
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  constructor(
    private session: AgentSession,
    private sessionId: string,
    ringBufferSize = 1024 * 1024,  // 1MB
  ) {
    this.ringBuffer = new RingBuffer(ringBufferSize);
  }

  /**
   * PTY 出力の読み取りを開始する。
   * terminalStream から読み取り、ring buffer に追記し、接続中の WS に転送。
   */
  async startRelay() {
    if (!this.session.terminalStream) return;
    this.reader = this.session.terminalStream.getReader();

    try {
      while (true) {
        const { done, value } = await this.reader.read();
        if (done) break;

        // Ring buffer に追記（常に）
        this.ringBuffer.write(value);

        // 接続中の WS クライアントに転送
        for (const ws of this.wsClients) {
          ws.sendBinary(value);
        }
      }
    } catch {
      // ストリーム終了 or エラー
    }
  }

  /**
   * WS クライアントを追加する。
   * 接続時に ring buffer の内容を replay。
   */
  addClient(ws: WebSocket) {
    // Ring buffer replay
    const buffered = this.ringBuffer.readAll();
    if (buffered.length > 0) {
      ws.sendBinary(buffered);
    }

    this.wsClients.add(ws);
  }

  /**
   * WS クライアントを除去する。
   * relay は止めない（ring buffer への書き込みは継続）。
   */
  removeClient(ws: WebSocket) {
    this.wsClients.delete(ws);
  }

  /**
   * ユーザー入力を PTY に書き込む。
   */
  handleInput(data: Uint8Array) {
    this.session.writeTerminal?.(data);
  }

  /**
   * ターミナルサイズを変更する。
   */
  handleResize(cols: number, rows: number) {
    this.session.resizeTerminal?.(cols, rows);
  }

  /**
   * セッション終了時にスクロールバックをディスクに保存する。
   */
  async persistScrollback(path: string) {
    const data = this.ringBuffer.readAll();
    await Bun.write(path, data);
  }

  /**
   * リソース解放。
   */
  dispose() {
    this.reader?.cancel();
    this.wsClients.clear();
  }
}
```

### RingBuffer

固定サイズの循環バッファ。最新の N バイトを保持。

```typescript
class RingBuffer {
  private buffer: Uint8Array;
  private writePos = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Uint8Array(capacity);
  }

  write(data: Uint8Array) {
    if (data.length >= this.capacity) {
      // データがバッファより大きい場合、末尾だけ保持
      this.buffer.set(data.subarray(data.length - this.capacity));
      this.writePos = 0;
      this.size = this.capacity;
      return;
    }

    const spaceAtEnd = this.capacity - this.writePos;
    if (data.length <= spaceAtEnd) {
      this.buffer.set(data, this.writePos);
    } else {
      this.buffer.set(data.subarray(0, spaceAtEnd), this.writePos);
      this.buffer.set(data.subarray(spaceAtEnd), 0);
    }

    this.writePos = (this.writePos + data.length) % this.capacity;
    this.size = Math.min(this.size + data.length, this.capacity);
  }

  readAll(): Uint8Array {
    if (this.size === 0) return new Uint8Array(0);

    if (this.size < this.capacity) {
      // まだ一周していない
      return this.buffer.slice(0, this.size);
    }

    // 一周以上 → writePos から末尾 + 先頭から writePos
    const result = new Uint8Array(this.capacity);
    const tailLen = this.capacity - this.writePos;
    result.set(this.buffer.subarray(this.writePos, this.writePos + tailLen), 0);
    result.set(this.buffer.subarray(0, this.writePos), tailLen);
    return result;
  }
}
```

---

## WebSocket ハンドラ

```typescript
// src/server/sessions/terminal-ws.ts
app.ws("/ws/terminal/:sessionId", {
  open(ws) {
    const sessionId = ws.data.params.sessionId;
    const relay = terminalRelays.get(sessionId);
    if (!relay) {
      ws.close(4004, "Session not found or not terminal-capable");
      return;
    }
    relay.addClient(ws);
  },

  message(ws, data) {
    const sessionId = ws.data.params.sessionId;
    const relay = terminalRelays.get(sessionId);
    if (!relay) return;

    if (typeof data === "string") {
      // JSON メッセージ（resize）
      const msg = JSON.parse(data);
      if (msg.type === "resize") {
        relay.handleResize(msg.cols, msg.rows);
      }
    } else {
      // バイナリ（ユーザー入力）
      relay.handleInput(new Uint8Array(data));
    }
  },

  close(ws) {
    const sessionId = ws.data.params.sessionId;
    const relay = terminalRelays.get(sessionId);
    relay?.removeClient(ws);
  },
});
```

---

## クライアント側

### レンダラー選択

```typescript
// S3 実行ビュー
function TerminalPanel({ sessionId }: { sessionId: string }) {
  // 1. restty が利用可能か確認（WebGPU サポート）
  // 2. 不可なら xterm.js にフォールバック

  if (supportsWebGPU()) {
    return <ResttyTerminal sessionId={sessionId} />;
  }
  return <XtermTerminal sessionId={sessionId} />;
}
```

### WebSocket 接続ライフサイクル

```
S3 を開く
  → /ws/terminal/:sessionId に接続
  → ring buffer replay を受信（過去の出力が表示される）
  → リアルタイム出力を受信 + 描画
  → ユーザー入力を binary frame で送信
  → ブラウザリサイズ → JSON { type: "resize", cols, rows } 送信

S3 を離れる
  → WS 切断
  → サーバー側: relay は継続（ring buffer 書き込み続行）

S3 に戻る
  → 再接続
  → ring buffer replay（離席中の出力が表示される）
```

### フロー制御

高速出力時のブラウザ側バックプレッシャー:

```typescript
// クライアント側
const WATERMARK_HIGH = 64 * 1024;  // 64KB
const WATERMARK_LOW = 16 * 1024;   // 16KB

let buffered = 0;

ws.onmessage = (e) => {
  if (e.data instanceof ArrayBuffer) {
    buffered += e.data.byteLength;
    terminal.write(new Uint8Array(e.data), () => {
      buffered -= e.data.byteLength;
    });

    // Watermark 超過時は WS を一時停止（bufferedAmount で自然に制御される）
    // ブラウザの WS 実装がバックプレッシャーを処理する
  }
};
```

---

## スクロールバック永続化

### 保存タイミング

1. セッション終了時（done / failed）
2. サーバーシャットダウン時（graceful shutdown）

### パス規則

```
data/scrollback/<session-id>.bin
```

`data/` は banto のデータディレクトリ（設定可能、デフォルトは `~/.local/share/banto/`）。

### 読み取り

S3 で完了済みセッションを開いたとき:

```typescript
if (session.status === "done" || session.status === "failed") {
  // DB の scrollback_path からファイルを読み取り
  if (session.scrollbackPath) {
    const data = await Bun.file(session.scrollbackPath).arrayBuffer();
    // REST で返す or WS で送信
  }
}
```
