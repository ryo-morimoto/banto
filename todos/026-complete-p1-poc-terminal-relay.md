---
status: complete
priority: p1
issue_id: "026"
tags: [poc, validation, terminal, restty, xterm]
dependencies: []
---

# PoC: Terminal Relay

## Problem Statement

Assumptions D1-D11 in `.z/v2/validation/assumptions.md` are unverified. restty (libghostty-vt WASM + WebGPU) availability and xterm.js fallback behavior need browser-level validation.

## Findings

N/A — to be filled during PoC execution.

## Proposed Solutions

1. **restty-only**: Test restty in a minimal HTML page with WebGPU
2. **xterm.js-only**: Test xterm.js with WS binary relay
3. **Both + comparison**: Test both renderers, measure FPS, document compat

**Recommended**: Option 3 — need fallback strategy.

## Recommended Action

1. Set up a minimal Bun server that:
   - Spawns a PTY process (e.g., `bash` running `ls -la` or `top`)
   - Relays PTY output via WebSocket binary frames
2. Create two HTML pages:
   - Page A: restty (if npm package available) with WebGPU
   - Page B: xterm.js with FitAddon
3. Validate:
   - Real-time rendering (visual inspection)
   - UTF-8 handling (multi-byte characters)
   - ANSI escape code rendering (colors, cursor movement)
   - Ring buffer: disconnect + reconnect replay
   - User keyboard input → PTY write
   - Resize handling (SIGWINCH)
4. Measure: FPS under load (e.g., `cat large-file.txt`)
5. Check WebGPU availability in Chrome, Firefox, Safari

Output: `.z/v2/validation/poc-terminal-relay.md`

## Acceptance Criteria

- [ ] PTY → WS binary relay working
- [ ] restty rendering tested (or documented as unavailable)
- [ ] xterm.js rendering tested
- [ ] UTF-8 multi-byte handling validated
- [ ] ANSI escape code rendering validated
- [ ] Ring buffer reconnect replay tested
- [ ] Keyboard input → PTY tested
- [ ] Resize/SIGWINCH tested
- [ ] WebGPU browser compatibility documented
- [ ] Assumptions D1-D11 each marked verified/falsified
- [ ] Results written to `.z/v2/validation/poc-terminal-relay.md`

## Work Log

### 2026-03-08 - Created

**By:** Claude Code

**Actions:**
- Created todo from assumptions.md D1-D11
