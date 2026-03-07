/**
 * Minimal PTY -> WebSocket -> Browser relay server.
 * Validates assumptions D1-D11 from the banto project.
 *
 * Usage: bun run server.ts
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

// --- Ring Buffer ---
const RING_BUFFER_SIZE = 1024 * 1024; // 1MB (D5)
class RingBuffer {
  private buffer = new Uint8Array(RING_BUFFER_SIZE);
  private writePos = 0;
  private totalWritten = 0;

  append(data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
      this.buffer[this.writePos] = data[i];
      this.writePos = (this.writePos + 1) % RING_BUFFER_SIZE;
    }
    this.totalWritten += data.length;
  }

  /** Returns all buffered data in order */
  getAll(): Uint8Array {
    if (this.totalWritten <= RING_BUFFER_SIZE) {
      return this.buffer.slice(0, this.totalWritten);
    }
    // Wrapped: read from writePos to end, then 0 to writePos
    const result = new Uint8Array(RING_BUFFER_SIZE);
    const tail = RING_BUFFER_SIZE - this.writePos;
    result.set(this.buffer.subarray(this.writePos), 0);
    result.set(this.buffer.subarray(0, this.writePos), tail);
    return result;
  }

  get size(): number {
    return Math.min(this.totalWritten, RING_BUFFER_SIZE);
  }

  get totalBytes(): number {
    return this.totalWritten;
  }
}

// --- PTY Spawn ---
// Bun doesn't have native PTY support, so we use node-pty via bun
// Fallback: use script(1) to create a PTY wrapper
function spawnPty(cols: number, rows: number) {
  // Use `script` to allocate a PTY for the child process
  const proc = spawn("script", ["-qc", "bash", "/dev/null"], {
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      COLUMNS: String(cols),
      LINES: String(rows),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return proc;
}

const PORT = 3456;
const ringBuffer = new RingBuffer();
let ptyProcess = spawnPty(80, 24);
const clients = new Set<any>();

// Track stats
let totalFrames = 0;
let totalInputBytes = 0;
const startTime = Date.now();

// --- PTY Output Handler ---
ptyProcess.stdout?.on("data", (data: Buffer) => {
  const bytes = new Uint8Array(data);
  ringBuffer.append(bytes);
  totalFrames++;

  // Broadcast to all connected WS clients as binary (D4)
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
});

ptyProcess.stderr?.on("data", (data: Buffer) => {
  // Also relay stderr
  const bytes = new Uint8Array(data);
  ringBuffer.append(bytes);
  for (const ws of clients) {
    try {
      ws.send(data);
    } catch {
      clients.delete(ws);
    }
  }
});

ptyProcess.on("exit", (code) => {
  console.log(`PTY process exited with code ${code}`);
});

// --- Scrollback Persistence (D10, D11) ---
const SCROLLBACK_PATH = path.join(import.meta.dir, "scrollback.bin");

async function persistScrollback(): Promise<{ durationMs: number; bytes: number }> {
  const data = ringBuffer.getAll();
  const start = performance.now();
  await Bun.write(SCROLLBACK_PATH, data); // D10: atomicity test
  const durationMs = performance.now() - start;
  return { durationMs, bytes: data.length };
}

// Periodic scrollback persistence
setInterval(async () => {
  const result = await persistScrollback();
  // Uncomment for debugging:
  // console.log(`Scrollback persisted: ${result.bytes} bytes in ${result.durationMs.toFixed(1)}ms`);
}, 5000);

// --- HTML Page ---
const HTML_PATH = path.join(import.meta.dir, "index.html");
const XTERM_CSS_PATH = path.join(
  import.meta.dir,
  "node_modules/@xterm/xterm/css/xterm.css"
);
const XTERM_JS_PATH = path.join(
  import.meta.dir,
  "node_modules/@xterm/xterm/lib/xterm.js"
);
const FIT_JS_PATH = path.join(
  import.meta.dir,
  "node_modules/@xterm/addon-fit/lib/addon-fit.js"
);

// --- Bun Server ---
Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }

    // Static files
    if (url.pathname === "/xterm.css") {
      return new Response(readFileSync(XTERM_CSS_PATH), {
        headers: { "Content-Type": "text/css" },
      });
    }
    if (url.pathname === "/xterm.js") {
      return new Response(readFileSync(XTERM_JS_PATH), {
        headers: { "Content-Type": "application/javascript" },
      });
    }
    if (url.pathname === "/addon-fit.js") {
      return new Response(readFileSync(FIT_JS_PATH), {
        headers: { "Content-Type": "application/javascript" },
      });
    }

    // Stats endpoint for validation
    if (url.pathname === "/stats") {
      return Response.json({
        ringBufferSize: ringBuffer.size,
        totalBytesWritten: ringBuffer.totalBytes,
        totalFrames,
        totalInputBytes,
        uptimeMs: Date.now() - startTime,
        connectedClients: clients.size,
      });
    }

    // Persist scrollback on demand
    if (url.pathname === "/persist") {
      return persistScrollback().then((result) => Response.json(result));
    }

    // Resize endpoint
    if (url.pathname === "/resize" && req.method === "POST") {
      return req.json().then(({ cols, rows }: { cols: number; rows: number }) => {
        // Send SIGWINCH equivalent by writing resize escape sequence
        // For real PTY we'd use pty.resize(), with script(1) we use stty
        try {
          ptyProcess.stdin?.write(`stty cols ${cols} rows ${rows}\n`);
        } catch {
          // ignore
        }
        return Response.json({ ok: true, cols, rows });
      });
    }

    // Default: serve HTML
    if (existsSync(HTML_PATH)) {
      return new Response(readFileSync(HTML_PATH), {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`Client connected (total: ${clients.size})`);

      // Replay ring buffer on connect (reconnect support)
      const replay = ringBuffer.getAll();
      if (replay.length > 0) {
        ws.sendBinary(Buffer.from(replay));
        console.log(`Replayed ${replay.length} bytes from ring buffer`);
      }
    },
    message(ws, message) {
      // Forward keyboard input to PTY (D7)
      if (typeof message === "string") {
        // JSON control messages
        try {
          const msg = JSON.parse(message);
          if (msg.type === "resize") {
            ptyProcess.stdin?.write(
              `stty cols ${msg.cols} rows ${msg.rows}\n`
            );
          }
        } catch {
          // Plain text input
          ptyProcess.stdin?.write(message);
          totalInputBytes += message.length;
        }
      } else {
        // Binary input
        ptyProcess.stdin?.write(Buffer.from(message as ArrayBuffer));
        totalInputBytes += (message as ArrayBuffer).byteLength;
      }
    },
    close(ws) {
      clients.delete(ws);
      console.log(`Client disconnected (total: ${clients.size})`);
    },
  },
});

console.log(`Terminal relay server running on http://localhost:${PORT}`);
console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
console.log(`Ring buffer size: ${RING_BUFFER_SIZE} bytes (1MB)`);
