# PTY & IPC Options for Programmatic Agent Control

**Date:** 2026-03-07
**Purpose:** Evaluate options for spawning and controlling CLI agents (e.g., Claude CLI) from a Bun/Node.js server process.

---

## 1. node-pty (microsoft/node-pty)

**What it is:** Native Node.js addon that provides `forkpty(3)` bindings. The standard for PTY in the Node ecosystem (used by VS Code terminal).

**API:**
```typescript
import * as pty from 'node-pty';

const proc = pty.spawn('claude', ['--args'], {
  name: 'xterm-256color',
  cols: 80,
  rows: 24,
  cwd: '/path/to/project',
  env: process.env,
});

proc.onData((data: string) => { /* output from process */ });
proc.onExit(({ exitCode, signal }) => { /* process exited */ });
proc.write('user input here\n');
proc.resize(120, 40);
proc.kill('SIGTERM');
proc.pause();   // flow control
proc.resume();  // flow control
```

**Key properties:** `pid`, `cols`, `rows`, `process` (active process title), `handleFlowControl`.

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | High | Battle-tested in VS Code, millions of users |
| Output state detection | Good | `onData` streams all output; parse for patterns |
| Input injection | Native | `write()` sends to PTY stdin |
| Implementation complexity | Low | Simple API, well-documented |

**Caveats:**
- Native addon (C++ compilation required). May need rebuild for Bun compatibility.
- Not thread-safe across worker threads.
- Security: child inherits parent process permissions.

---

## 2. Bun.Terminal (Bun built-in PTY)

**What it is:** Built-in PTY support added in Bun v1.3.5 (Dec 2025). No native addon needed.

**API:**
```typescript
const proc = Bun.spawn(['claude', '--args'], {
  terminal: {
    cols: 80,
    rows: 24,
    name: 'xterm-256color',
    data(terminal, data) {
      // output callback - equivalent to onData
    },
    exit(terminal, code) {
      // 0 = EOF, 1 = error
    },
    drain(terminal) {
      // ready for more data
    },
  },
});

proc.terminal.write('user input\n');
proc.terminal.resize(120, 40);
proc.terminal.setRawMode(true);
proc.terminal.close();
proc.terminal.ref();    // keep event loop alive
proc.terminal.unref();  // allow event loop to exit
```

**Reusable terminal:** Can create `new Bun.Terminal(options)` independently and pass it to multiple spawns.

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | Medium | Newer API, less battle-tested than node-pty |
| Output state detection | Good | `data` callback streams output |
| Input injection | Native | `write()` method |
| Implementation complexity | Very Low | Zero dependencies, no native compilation |

**Caveats:**
- POSIX-only (Linux, macOS). No Windows support.
- Relatively new (Dec 2025). May have edge cases.
- When `terminal` is set, stdin/stdout/stderr are not separately accessible (all routed through PTY).

**Verdict: Best option for banto.** Zero deps, native Bun integration, POSIX-only is fine (NixOS target).

---

## 3. Expect-like Libraries (spectcl, nexpect)

**What they are:** Higher-level wrappers that add pattern-matching on PTY output, similar to Tcl Expect / Python pexpect.

### spectcl
```typescript
import Spectcl from 'spectcl';

const session = new Spectcl({ timeout: 30 });
session.spawn('ssh', ['user@host']);
session.expect([
  ['password:', () => { session.send('mypassword\n'); }],
  ['TIMEOUT', () => { /* handle timeout */ }],
  ['EOF', () => { /* handle end */ }],
]);
```

- Wraps child in PTY by default (can disable with `{noPty: true}`)
- Pattern matching with timeout/EOF handling
- Based on node-pty under the hood

### nexpect (older, by nodejitsu)
- Predecessor to spectcl. Simpler API but less maintained.

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | Low-Medium | Pre-v1.0, not widely adopted |
| Output state detection | Built-in | Pattern matching is the core feature |
| Input injection | Native | `send()` method |
| Implementation complexity | Low | High-level API |

**Verdict:** Interesting pattern (expect-style matching) but the libraries are undermaintained. Better to build a thin expect layer on top of Bun.Terminal or node-pty if needed.

---

## 4. Named Pipes (FIFO)

**What it is:** OS-level IPC mechanism using filesystem paths. Created with `mkfifo`.

**How it works:**
```bash
mkfifo /tmp/agent-in
mkfifo /tmp/agent-out

# Writer
echo "command" > /tmp/agent-in

# Reader (in another process)
cat < /tmp/agent-out
```

In Node.js/Bun: open FIFOs as regular file descriptors using `fs.createReadStream` / `fs.createWriteStream`.

**Key characteristics:**
- Unidirectional: need TWO pipes for bidirectional communication
- Blocking: `open()` blocks until both ends are connected
- No disk I/O: kernel buffers data in memory
- No broadcast: single reader/writer pair

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | Medium | Robust OS primitive, but blocking semantics are tricky |
| Output state detection | Poor | Raw byte stream, no terminal emulation |
| Input injection | Good | Write to the input FIFO |
| Implementation complexity | Medium | Need to manage two pipes, handle blocking, cleanup |

**Verdict:** Not suitable for PTY-based agent control. FIFOs don't provide terminal emulation, so the spawned process won't think it has a TTY. Could work as a sideband communication channel alongside a PTY.

---

## 5. Unix Domain Sockets (UDS)

**What it is:** Bidirectional, full-duplex IPC over filesystem paths. ~50% lower latency than TCP loopback (130us vs 334us).

**Node.js built-in:**
```typescript
import net from 'net';

// Server
const server = net.createServer((socket) => {
  socket.on('data', (data) => { /* handle */ });
  socket.write('response');
});
server.listen('/tmp/agent.sock');

// Client
const client = net.connect('/tmp/agent.sock');
client.write('command');
```

**Bun built-in IPC:**
```typescript
const proc = Bun.spawn(['agent-wrapper'], {
  ipc(message) {
    // receive structured messages from child
  },
});
proc.send({ type: 'command', payload: '...' });
```

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | High | Mature OS primitive, well-supported |
| Output state detection | N/A | Not a PTY; no terminal emulation |
| Input injection | Good | Bidirectional, structured messages |
| Implementation complexity | Medium | Need wrapper process or protocol |

**Verdict:** Excellent for structured IPC (commands, status updates) but doesn't replace PTY. Best used as a control channel alongside a PTY for terminal output. Pattern: PTY for output streaming + UDS for commands/status.

---

## 6. Process Signals

**Available signals for process control:**

| Signal | Effect | Catchable? | Use Case |
|---|---|---|---|
| SIGSTOP | Freeze process immediately | No | Pause agent execution |
| SIGCONT | Resume frozen process | Yes | Resume paused agent |
| SIGTERM | Request graceful termination | Yes | Stop agent cleanly |
| SIGINT | Interrupt (like Ctrl+C) | Yes | Cancel current operation |
| SIGKILL | Force kill immediately | No | Last resort |
| SIGHUP | Hangup | Yes | Reload or terminate |

**Usage from Node.js/Bun:**
```typescript
process.kill(pid, 'SIGSTOP');  // pause
process.kill(pid, 'SIGCONT');  // resume
process.kill(pid, 'SIGTERM');  // graceful stop
```

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | High | OS-level, always works |
| Output state detection | N/A | Signals don't provide output |
| Input injection | N/A | One-way (signal only) |
| Implementation complexity | Very Low | Single function call |

**Key caveats:**
- SIGSTOP/SIGCONT preserve process state and resources. Process resumes exactly where it paused.
- When running via npm/package manager, signals may not propagate correctly to child processes.
- SIGTERM not supported on Windows.

**Verdict:** Complementary tool. Use alongside PTY for pause/resume/stop. Essential for session lifecycle management.

---

## 7. tmux Programmatic Control

**What it is:** Terminal multiplexer with a rich CLI and a dedicated "control mode" protocol for external program integration.

### Standard CLI
```bash
tmux new-session -d -s agent1          # create detached session
tmux send-keys -t agent1 'command' Enter  # inject input
tmux capture-pane -t agent1 -p         # read current output
tmux kill-session -t agent1            # terminate
```

### Control Mode (tmux -C)
A text-based protocol for full programmatic control:
- Start: `tmux -C new-session` or `tmux -C attach-session`
- Commands produce output wrapped in `%begin`/`%end` guards
- Async notifications: `%output`, `%pane-mode-changed`, `%window-add`, `%session-changed`, etc.
- Flow control: `refresh-client -f pause-after=N`
- Format subscriptions: `refresh-client -B name:type:format` for state change notifications

**Targeting:** Sessions (`$id`), windows (`@id`), panes (`%id`) for precise addressing.

### screen (comparison)
- Simpler: `screen -S name -X stuff 'command\n'` for input, `screen -S name -X hardcopy /tmp/out` for output
- Less scriptable: no control mode protocol, fewer commands
- Better reconnect: `screen -r` is more forgiving on dropped connections
- Simpler architecture: one process per session

**Assessment:**
| Criterion | Rating | Notes |
|---|---|---|
| Long-running reliability | Very High | Designed for persistent sessions, survives disconnects |
| Output state detection | Good | `capture-pane` for snapshot, `%output` in control mode for stream |
| Input injection | Good | `send-keys` for keystrokes |
| Implementation complexity | Medium-High | External dependency, protocol parsing for control mode |

**Verdict:** Overkill for single-agent PTY control. But tmux control mode is interesting for multi-session management. The protocol is well-designed but adds significant complexity compared to direct PTY access.

---

## 8. ConPTY (Windows)

Not needed for banto (NixOS target). Noted for completeness:
- Windows 10 1809+ provides ConPTY API
- node-pty uses ConPTY on supported Windows builds
- Bun.Terminal is POSIX-only, no ConPTY support

---

## Recommendation Matrix

| Approach | Best For | banto Fit |
|---|---|---|
| **Bun.Terminal** | Direct PTY spawn & control | **Primary choice** - zero deps, native |
| **node-pty** | Fallback if Bun.Terminal has issues | Backup option |
| **Signals** | Pause/resume/stop lifecycle | **Complement** to PTY |
| **UDS** | Structured command/status IPC | Consider if need side-channel |
| **tmux** | Persistent sessions surviving server restarts | Consider for crash recovery |
| **FIFOs** | Simple one-way data passing | Not suitable alone |
| **spectcl** | Pattern matching on output | Build custom; libs unmaintained |
| **ConPTY** | Windows support | Not applicable |

## Recommended Architecture for banto

```
[Bun Server]
    |
    +-- Bun.spawn({ terminal: {...} })  --> [Claude CLI process]
    |       |
    |       +-- terminal.write()         (inject input)
    |       +-- data callback            (stream output)
    |       +-- terminal.resize()        (handle resize)
    |
    +-- process.kill(pid, signal)        (lifecycle control)
    |       SIGSTOP  = pause
    |       SIGCONT  = resume
    |       SIGTERM  = graceful stop
    |
    +-- WebSocket to browser             (relay terminal I/O)
```

If crash recovery / server restart persistence becomes a requirement, tmux can be layered in:
```
[Bun Server] -- tmux control mode --> [tmux session] --> [Claude CLI]
```
