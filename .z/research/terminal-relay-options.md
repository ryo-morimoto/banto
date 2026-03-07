# Terminal Output Relay: Backend to Browser

Date: 2026-03-07
Goal: Research ALL viable options for relaying terminal output from banto server to browser client.

## 1. xterm.js

**Maturity: Production (industry standard)**
**Stars: 17k+ | Used by: VS Code, Azure Cloud Shell, Replit, ttyd, GitHub Codespaces**

### Current State (2025-2026)

xterm.js is the dominant web terminal emulator. Active development continues with regular releases.

**Renderers:**
- DOM renderer (default) — significantly improved performance recently
- WebGL2 renderer (`@xterm/addon-webgl` v0.19.0) — GPU-accelerated, recommended for performance
- Canvas renderer — deprecated, removed in favor of DOM + WebGL

**Addon Ecosystem (all under `@xterm/addon-*` scope):**
- `addon-webgl` — WebGL2 rendering
- `addon-fit` — auto-resize to container
- `addon-serialize` — serialize terminal state to string/HTML
- `addon-search` — buffer search
- `addon-image` — inline images (SIXEL + iTerm IIP)
- `addon-ligatures` — programming font ligatures (fallback mode works without font access)
- `addon-unicode11` / `addon-unicode-graphemes` — enhanced Unicode/grapheme clustering
- `addon-web-links` — clickable URLs
- `addon-web-fonts` — web font loading

**Performance:**
- Texture atlas: multiple 512x512 textures, merging up to 4096x4096 — essentially unlimited glyph space
- Synchronized output (DEC mode 2026) — batches rendering updates for large bursts
- `rescaleOverlappingGlyphs` option for GPU mode
- `onWriteParsed` API for post-parse hooks

**Large Output Handling:**
- Built-in flow control via `write()` callback mechanism
- Watermark-based backpressure: track buffered data between HIGH/LOW thresholds
- Optimized: attach callbacks every 100KB instead of per-chunk
- For WebSocket: span flow control client-to-server via custom ACK messages
- Internal write speed: 5-35 MB/s depending on content complexity

**Known Issues:**
- GPU thermal throttling on constrained hardware (Dec 2025 issue)
- Search is slow with 10k+ long wrapped lines
- Memory overhead with many terminals + large scrollback
- Proposed but not yet shipped: `targetFps` option for write coalescing

**Browser Support:** Latest Chrome, Edge, Firefox, Safari (evergreen only)

**Integration Complexity:** Low — npm install, well-documented API, massive ecosystem

### Verdict for banto

The safe choice. Proven at scale. The WebGL renderer + flow control + serialize addon cover all banto requirements. The main downside is that it's a "classic" approach — Canvas/WebGL rather than WebGPU.

---

## 2. ghostty-web (Coder)

**Maturity: Early (alpha/beta)**
**GitHub: coder/ghostty-web**

### Current State

- Drop-in xterm.js replacement (same API: `@xterm/xterm` -> `ghostty-web`)
- Uses Ghostty's VT100 parser compiled to WASM (~400KB bundle)
- Canvas renderer with dirty-row optimization (RenderState API)
- Zero runtime dependencies
- Built for Coder's "Mux" product (parallel agentic development)

**Architecture:**
- Zig (Ghostty source) compiled to WASM
- Minimal patches on top of Ghostty source
- Will eventually consume official libghostty WASM distribution

**Advantages over xterm.js:**
- VT parsing quality: Ghostty's parser is fuzz-tested, battle-hardened
- Single WASM module handles parse + state (no JS parser overhead)
- Smaller surface area (less JS code)

**Problems (experienced in banto v1):**
1. IME handling broken — required custom `ime-controller.ts`
2. Resize broken — required custom FitAddon equivalent
3. ANSI colors — required explicit theme passing
4. Input bridge — manual compositionstart/update/end handling
5. No GPU acceleration (Canvas only, no WebGL/WebGPU)

**libghostty Status:**
- libghostty-vt Zig API available for testing (Sep 2025)
- C API not ready yet
- Not planned for Ghostty 1.3 (Mar 2026) — long-term roadmap item
- Ghostty moved to non-profit (Hack Club) governance

**Browser Support:** Same as xterm.js (it renders to Canvas)

**Integration Complexity:** Low (npm install, xterm.js API compatibility)

### Verdict for banto

Inferior to xterm.js for banto's needs right now. The VT parser quality is better, but the browser integration layer (IME, resize, input) is immature. The Canvas-only renderer is a performance ceiling. Already tried in banto v1 with known pain points.

---

## 3. restty

**Maturity: Early release (Feb 2026)**
**GitHub: wiedymi/restty | Stars: ~272 | npm: `restty`**

### Current State

- libghostty-vt (WASM) + WebGPU + text-shaper (pure TS)
- WebGPU rendering with WebGL2 fallback
- Built-in IME handling (hidden IME input auto-generated)
- Touch support (pan-first scrolling, selection modes)
- Multi-pane support
- Plugin system
- 40+ built-in themes (Ghostty format)
- xterm.js compatibility shim (partial — no buffer/parser/marker APIs)

**Architecture:**
```
src/surface/   — public API, pane manager, plugin host, xterm shim
src/runtime/   — terminal runtime / render loop
src/subsystems — renderer, input, pty, fonts, theme, wasm, selection
```

**Real-World Usage:**
- Microterm (Linux VM in browser via RISC-V64 emulation + restty terminal)

**Known Issues:**
- "early release stage" — APIs may change
- Kitty image protocol handling fails in edge cases
- xterm.js shim is incomplete (not full internals parity)
- 1 open issue on GitHub (as of Mar 2026)
- Small community, single maintainer

**WebGPU Browser Support (as of 2026):**
- Chrome: shipped since Apr 2023
- Edge: shipped
- Safari: shipped since Jun 2025 (Safari 26)
- Firefox: shipped since Jul 2025 (Firefox 141)
- Firefox Linux: expected 2026
- Firefox Android: expected 2026

**Integration Complexity:** Low (npm install, `new Restty(root)`, connect WebSocket)

### Verdict for banto

The most promising option for banto's architecture. WebGPU rendering, built-in IME/touch, libghostty-vt parsing — exactly what the v2 architecture targets. Risk is immaturity and single-maintainer dependency. Mitigation: the API surface is small enough to fork if needed.

---

## 4. hterm (Chrome OS)

**Maturity: Mature but declining**

### Current State

- Originally built for Chrome OS Secure Shell extension
- xterm-compatible terminal emulator in pure JavaScript
- Built for correctness and performance from the start
- Chrome OS itself is migrating Terminal app from hterm to xterm.js (since M107)

**Issues:**
- Not available as a proper npm package
- Declining development — Chrome team is moving to xterm.js
- Secure Shell extension still uses hterm but no plans to change
- CJK support worse than xterm.js

### Verdict for banto

Dead end. The Chrome team is abandoning it in favor of xterm.js. No reason to adopt.

---

## 5. Kitty Protocol over Web

**Maturity: N/A (no browser implementation exists)**

### Current State

- Kitty's graphics protocol is designed for native terminals
- No project brings the full Kitty protocol to browsers
- Kitty's 2026 roadmap hints at "WebGPU kitten for browser terminals" but nothing concrete
- awrit renders Chromium inside Kitty terminal (opposite direction)
- Some terminals (including restty) partially support Kitty image protocol

### Verdict for banto

Not a viable option. No browser implementation exists.

---

## 6. Server-Side Rendering (SSR) of Terminal

### Approaches

**A. ANSI-to-HTML Conversion (Static)**

Libraries:
- `ansi-to-html` (npm) — JS, converts ANSI escape codes to HTML
- `ansi_up` (npm) — zero-dependency ES6, isomorphic JS
- `terminal-to-html` (Go, by Buildkite) — production-quality ANSI->HTML
- `to-html` (Rust crate) — ANSI->HTML, works with bash/fish/ksh/zsh

Pros:
- Simple, no client-side terminal emulator needed
- Works on any browser (just HTML/CSS)
- Lightweight client

Cons:
- Loses interactivity (no input, no cursor, no scrollback)
- Does not handle full VT sequences (alternate screen, cursor movement, etc.)
- Re-rendering on every update is expensive for large output
- No selection, search, or copy behavior

**B. GoTTY / ttyd (Live Terminal Sharing)**

**GoTTY** (Go):
- Original: yudai/gotty (requires go1.9, unmaintained)
- Fork: sorenisanerd/gotty (requires go1.16, maintained)
- Spawns new process per client connection
- WebSocket relay to xterm.js frontend
- Standalone binary, not embeddable as library

**ttyd** (C):
- Built on libwebsockets + libuv + xterm.js (WebGL2)
- CJK + IME support, ZMODEM file transfer
- SSL, basic auth, Docker support
- Active maintenance
- Standalone binary — NOT a library you embed in your app

Both GoTTY and ttyd are standalone servers. They cannot be embedded into banto's Elysia server. They use xterm.js on the frontend anyway, so the question reduces to "use xterm.js directly."

**C. asciinema Player (Recording/Streaming)**

- Player built with JS + Rust (WASM)
- Own VT parser (not xterm.js)
- Supports live streaming (new in 3.x, Rust rewrite)
  - Local mode: built-in HTTP server for LAN viewing
  - Remote mode: relay via asciinema server
  - WebSocket driver with adaptive buffer for smooth playback
- asciicast format (.cast) — lightweight text-based

Pros:
- Excellent for playback/review of completed sessions
- Live streaming with minimal latency
- Own WASM-based VT interpreter (no xterm.js dependency)
- Audio support for streams

Cons:
- Read-only — no input to terminal
- Designed for recording/playback, not interactive sessions
- Would need significant adaptation for banto's interactive use case
- No keyboard input relay

### Verdict for banto

**ANSI-to-HTML**: Useful for the Timeline/Event view (rendering small snippets of output), not for the full terminal widget.

**GoTTY/ttyd**: Standalone tools, not embeddable. banto already has its own PTY management; these add nothing.

**asciinema**: Interesting for session replay after completion. Could complement (not replace) the terminal widget. The live streaming feature is architecturally similar to what banto needs but lacks input.

---

## 7. Warp Terminal Technology

**Maturity: Closed source, not available as library**

### Current State

- Custom Rust UI framework + Metal (macOS) / wgpu (Linux)
- GPU rendering: only rectangles, images, glyphs — 200 lines of shader code
- Performance: >144 FPS, 1.9ms average redraw
- Linux version uses wgpu + winit + cosmic-text
- Plans to open-source UI framework — not yet done (as of Mar 2026)
- Server portion will remain closed source

### Verdict for banto

Not available. No embeddable library. No web/WASM target. No open-source release of the rendering engine.

---

## 8. Rio Terminal

**Maturity: Desktop-focused, browser support experimental**

### Current State

- Rust + wgpu + Tokio
- Sugarloaf renderer has WASM target
- Redux state machine for minimal redraws
- wgpu compiles to wasm32-unknown-unknown for browser via WebGPU/WebGL2
- WASM plugin system planned

**Browser Status:**
- No working browser demo found (as of Mar 2026)
- WASM support is a stated goal but not production-ready
- Desktop is the primary focus

### Verdict for banto

Not ready for browser use. The wgpu-to-WASM pipeline exists in theory but Rio hasn't shipped a working browser version. Too risky to depend on.

---

## 9. VT Parsing Libraries (Server-Side Parsing)

### The Idea

Instead of sending raw PTY bytes to the browser and parsing client-side, parse VT sequences server-side and send structured "screen state" updates.

### Available Libraries

**Rust:**
- **vte** (Alacritty) — low-level parser, tokenizes escape sequences, no state. You implement the `Perform` trait.
- **vt100** crate — higher-level, maintains in-memory screen buffer. Analogous to xterm-headless.
- **vt100-psmux** — fork with blink/hidden/strikethrough SGR support. Updated Mar 2026.
- **r3bl_tui** — comprehensive: PTY integration + OffscreenBuffer as standalone in-memory terminal emulator. Can diff buffers, capture screens.

**JavaScript:**
- **@xterm/headless** — xterm.js without DOM rendering, runs in Node.js. Maintains full terminal state. Compatible with serialize addon for state snapshots.

### Architecture Pattern

```
PTY output (raw bytes)
  |
  v
Server-side VT parser (vt100 / xterm-headless)
  |
  v
Structured screen state (cells, attributes, cursor position)
  |
  v
Diff against previous state
  |
  v
Send delta to browser via WebSocket
  |
  v
Browser renders grid (React, Canvas, or simple DOM)
```

**Pros:**
- Browser receives structured data, not raw ANSI
- Can optimize diffs (only send changed cells)
- No WASM or heavy terminal emulator in browser
- Full control over rendering
- Can extract semantic information server-side (tool use, file edits, etc.)

**Cons:**
- Server CPU cost for parsing every terminal's output
- Must implement a rendering layer (font metrics, cursor, selection, scrollback)
- Loss of terminal features that depend on client-side VT state
- Higher complexity than just sending raw bytes + xterm.js
- Latency: extra processing step before data reaches client

### xterm-headless + serialize: The Hybrid

The most practical server-side approach:
1. Run `@xterm/headless` on server alongside each PTY
2. Feed PTY output into headless terminal
3. Use serialize addon to snapshot state
4. On client connect: send serialized state for instant restore
5. After initial sync: forward raw PTY bytes to client's xterm.js
6. Headless terminal also powers the observation layer (event extraction)

This is NOT a replacement for client-side xterm.js — it's a complement for:
- Session state persistence across client reconnections
- Server-side event extraction (pattern matching on parsed output)
- Replay buffer with full state

### Verdict for banto

**Pure server-side rendering**: Too complex, too many trade-offs. Not recommended as the primary approach.

**xterm-headless as complement**: Highly recommended. Use it for:
1. Observation layer (pattern matching on structured terminal state)
2. Replay buffer (serialize state for reconnecting clients)
3. State persistence (save terminal state to DB on session end)

This pairs naturally with the existing banto architecture (ring buffer + event extractor).

---

## 10. Multiplexed WebSocket Protocol

### The Problem

banto has N concurrent terminal sessions. How to handle them over WebSocket?

### Option A: One WebSocket Per Session (Simple)

```
/api/sessions/:id/terminal  -> one WS per session
```

Current banto v2 design. Client opens WS only when terminal widget is visible.

Pros:
- Simple implementation
- Natural lifecycle (WS open = watching, WS close = not watching)
- Browser limit: ~6 WS per origin in HTTP/1.1, effectively unlimited in HTTP/2

Cons:
- Many connections if user has many sessions open
- Each WS has TCP overhead (handshake, keepalive)

### Option B: Single Multiplexed WebSocket

```
/api/terminal  -> one WS, multiplexed channels
```

**Protocols:**

1. **Custom framing**: Prefix each message with session ID
   ```
   [4 bytes: session_id_length][session_id][payload]
   ```

2. **SockJS websocket-multiplex**: Simple text protocol
   ```
   type,topic,payload  (sub/unsub/msg)
   ```

3. **wsmux**: Stream-based multiplexer, each stream = separate net.Conn
   - Stream IDs for routing
   - Proper flow control per stream

4. **HTTP/2 WebSocket multiplexing** (RFC 8441):
   - Browser opens multiple WS over single HTTP/2 connection
   - Transparent to application code
   - Requires HTTP/2 support on both ends

Pros:
- Single TCP connection
- Less handshake overhead
- Centralized flow control

Cons:
- Head-of-line blocking (one slow session blocks others)
- More complex implementation
- Must handle subscribe/unsubscribe per session
- Error isolation harder

### How VS Code Does It

VS Code Remote uses SSH connection multiplexing (OpenSSH ControlMaster), not WebSocket multiplexing. For browser-based scenarios (Codespaces), it uses HTTP/2 with WebSocket over Extended CONNECT.

### Verdict for banto

**Option A (one WS per session) is correct for banto.** Reasons:
- banto shows one task at a time (right panel). Usually 0-1 terminal WS open.
- Visibility-aware: WS connects on expand, disconnects on collapse.
- HTTP/2 makes multiple WS connections cheap (single TCP, no extra handshakes).
- Multiplexing adds complexity with no benefit for the 1-active-terminal UX.
- If future UX shows multiple terminals simultaneously, HTTP/2 still handles it.

---

## 11. Performance: High-Throughput Terminal Output

### Bottlenecks (ranked by impact)

1. **Client-side rendering** — DOM updates, WebGL draw calls, font shaping
2. **WebSocket buffering** — producer faster than consumer
3. **VT parsing** — processing escape sequences
4. **Network** — rarely the bottleneck on LAN (banto is self-hosted)

### Throughput Numbers

- xterm.js write speed: 5-35 MB/s depending on content
- Compilation output: typically 1-10 KB/s (not a problem)
- `cat large-file.txt`: can exceed 100 MB/s (problem case)
- Agent output (Claude Code, Codex): 1-50 KB/s typical, burst to 500 KB/s during tool output

### Strategies

**A. Flow Control (Essential)**

xterm.js watermark approach:
1. Track bytes written but not yet rendered
2. When buffered > HIGH watermark (e.g., 5MB): pause PTY reads
3. When buffered < LOW watermark (e.g., 1MB): resume PTY reads
4. For WebSocket: use write callback to send ACK, server pauses on no ACK

**B. Write Coalescing / Throttling**

```
First chunk -> render immediately (responsiveness)
Subsequent chunks within 16ms -> buffer
After 16ms (one frame) -> flush buffer, render once
```

This naturally limits rendering to 60fps regardless of input rate.

**C. Ring Buffer with Replay**

banto v2 already designs this:
- 1MB ring buffer per session on server
- New client connects -> replay ring buffer -> switch to live stream
- If client falls behind, skip to latest state (lossy but real-time)

**D. Selective Rendering**

Only render the terminal widget when visible:
- IntersectionObserver: disconnect WS when terminal scrolls out of view
- Page Visibility API: disconnect when tab is hidden
- Reconnect + replay on re-visibility

**E. Scrollback Limit**

Limit scrollback buffer to 5000-10000 lines. Agent sessions rarely need more. Reduces memory and search overhead.

### Verdict for banto

Agent output is NOT the high-throughput problem case. Claude Code, OpenCode, Codex produce moderate output (1-50 KB/s). The real concerns are:
1. Tool output bursts (e.g., test runner dumping 1000 lines)
2. `cat` or build output during agent execution

Flow control + write coalescing + visibility-aware WS are sufficient. The ring buffer with replay handles reconnection gracefully.

---

## Summary: Recommendation Matrix

| Approach | Use Case | Recommended? | Notes |
|---|---|---|---|
| xterm.js | Primary terminal widget | YES (safe choice) | Industry standard, proven at scale |
| restty | Primary terminal widget | YES (bold choice) | WebGPU, libghostty, but early |
| ghostty-web | Primary terminal widget | NO | Tried in v1, IME/resize issues, Canvas only |
| hterm | Any | NO | Declining, Chrome team abandoning |
| Kitty protocol | Any | NO | No browser implementation |
| ANSI-to-HTML | Timeline snippets | MAYBE | For small output previews, not full terminal |
| GoTTY/ttyd | Any | NO | Standalone tools, not embeddable |
| asciinema | Session replay | MAYBE | Complement for reviewing completed sessions |
| Warp tech | Any | NO | Closed source, no library |
| Rio | Any | NO | No working browser version |
| Server-side VT | Observation layer | YES | xterm-headless for state tracking |
| Single WS mux | Transport | NO | Over-engineering for banto's UX |
| Per-session WS | Transport | YES | Simple, visibility-aware |

## Decision Framework

### Path A: xterm.js (Conservative)

```
Client: xterm.js + WebGL renderer + fit + serialize + search
Server: xterm-headless (observation) + ring buffer + per-session WS
```

Pros: Proven, documented, huge community, addon ecosystem
Cons: No WebGPU, larger JS bundle, VT parser in JS (less correct than Ghostty's)

### Path B: restty (Progressive)

```
Client: restty (libghostty-vt + WebGPU)
Server: ring buffer + per-session WS
```

Pros: WebGPU rendering, Ghostty-quality VT parsing, built-in IME/touch
Cons: Early project, single maintainer, may need to fork

### Path C: Hybrid (Pragmatic)

```
Client: xterm.js now, migrate to restty when stable
Server: xterm-headless (observation) + ring buffer + per-session WS
```

Start with xterm.js. The WebSocket protocol is the same (raw PTY bytes). When restty matures, swap the client-side terminal component. The server is unchanged.

### Key Insight

The server-side architecture (PTY management, ring buffer, WebSocket relay, observation layer) is identical regardless of which client-side terminal emulator is chosen. The choice between xterm.js and restty is a client-only decision that can be changed later.
