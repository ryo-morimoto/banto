# Technical Assumptions

All technical assumptions extracted from `.z/v2/architecture/` and `.z/v2/product/`. Each assumption is unverified — confirmed only by implementation or PoC.

**Confidence**: How likely the assumption is correct based on documentation/experience.
- **high**: Strong evidence (official docs, widely known behavior)
- **medium**: Reasonable inference but no direct confirmation
- **low**: Speculative or based on unstable/undocumented APIs

**Risk**: What happens if the assumption is wrong.
- **critical**: Data corruption, security breach, or complete feature failure
- **high**: Major feature degradation or user-visible breakage
- **medium**: Workaround exists but degrades UX
- **low**: Minor inconvenience

---

## A. Claude Code Integration

Verified by: `poc-claude-code-hooks.md`

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| A1 | CC accepts `--print` with `--hook-config` JSON parameter for HTTP callbacks | medium | critical | providers/claude-code.md |
| A2 | CC HTTP hooks emit Notification events containing session ID and `context_window` info | medium | high | providers/claude-code.md |
| A3 | CC hooks provide Pre/PostToolUse events with `tool_name` and `tool_input` fields | medium | high | providers/claude-code.md |
| A4 | CC MCP `permission_prompt` tool callback returns `{ approved: boolean }` synchronously | low | critical | providers/claude-code.md |
| A5 | CC `--resume` flag accepts a session ID and resumes prior context | medium | high | providers/claude-code.md |
| A6 | CC Notification hook includes idle/tool_use event types with documented payload structure | medium | medium | providers/claude-code.md |
| A7 | Hook HTTP endpoint port is accessible from CC subprocess (localhost) | high | high | providers/claude-code.md |
| A8 | CC process environment variables (TERM, COLORTERM) are correctly inherited | high | low | providers/claude-code.md |

---

## B. Codex Integration

Verified by: `poc-codex-app-server.md`

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| B1 | `codex app-server` command exists and accepts JSON-RPC 2.0 over stdio | medium | critical | providers/codex.md |
| B2 | RPC methods are `turn/start`, `approval/accept`, `approval/decline`, `turn/cancel`, `thread/resume` | low | critical | providers/codex.md |
| B3 | app-server stays alive between turns (does not exit on turn completion) | medium | high | providers/codex.md |
| B4 | `UsageUpdate` events contain `input_tokens`, `output_tokens`, `cost` fields | low | medium | providers/codex.md |
| B5 | `turn/start` during active turn works for mid-session messaging | low | high | providers/codex.md |
| B6 | `thread/resume` picks up exactly where a previous thread left off | medium | high | providers/codex.md |

---

## C. ACP Protocol

Verified by: `poc-acp-connection.md`

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| C1 | ACP uses JSON-RPC 2.0 over stdio with line-delimited framing | medium | critical | providers/acp.md |
| C2 | `initialize` returns `{ capabilities }` declaring resume, permission, context tracking | medium | high | providers/acp.md |
| C3 | Event method names are standardized: `message/created`, `tool/called`, `permission/requested`, etc. | low | high | providers/acp.md |
| C4 | ACP agents emit `context/updated` if they support context tracking | low | medium | providers/acp.md |
| C5 | `permission/respond` is processed synchronously by agent | medium | medium | providers/acp.md |
| C6 | At least one ACP-compatible agent exists and can be tested end-to-end | low | critical | providers/acp.md |

---

## D. Terminal Relay & Rendering

Verified by: `poc-terminal-relay.md`

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| D1 | restty (libghostty-vt WASM + WebGPU) renders PTY output at 60 FPS in real time | low | high | dual-mode-ui.md |
| D2 | WebGPU is available in target browsers (Chrome, Edge; Firefox fallback needed) | medium | high | dual-mode-ui.md |
| D3 | xterm.js write() supports streaming callback without blocking render loop | high | medium | terminal-relay.md |
| D4 | WebSocket binary frame delivery is in-order and reliable | high | medium | terminal-relay.md |
| D5 | Ring buffer of 1MB holds ~10-30 minutes of terminal output | medium | medium | terminal-relay.md |
| D6 | Multi-byte UTF-8 sequences split across WS frames are handled correctly | medium | medium | terminal-relay.md |
| D7 | PTY write (user keyboard input) is non-blocking | high | medium | terminal-relay.md |
| D8 | SIGWINCH from resize events doesn't corrupt agent terminal state | medium | medium | interaction-flows.md |
| D9 | xterm.js/restty correctly interprets ANSI escape codes from all target agents | high | low | screen-inventory.md |
| D10 | Bun.write() for scrollback persistence is atomic (no corruption on crash) | medium | high | terminal-relay.md |
| D11 | `persistScrollback()` doesn't block event loop during file I/O | medium | medium | terminal-relay.md |

---

## E. Event Ledger & Data Model

Verified by: `poc-event-ledger.md`

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| E1 | SQLite WAL mode handles concurrent reads (WS queries) + writes (event inserts) without contention | high | high | data-model.md |
| E2 | Event ledger append + materialization is fast enough for 100+ events/session/minute | medium | high | event-system.md |
| E3 | `busy_timeout = 5000` prevents SQLITE_BUSY under single-user multi-session load | high | medium | data-model.md |
| E4 | Append-only invariant (no DELETE on session_events) is maintained by convention | high | critical | event-system.md, data-model.md |
| E5 | JSON.stringify(event.payload) always produces valid round-trippable JSON | high | high | event-system.md |
| E6 | `git diff --stat` output is parseable into DiffSummary schema across git versions | medium | medium | data-model.md |
| E7 | `git diff --stat` completes in <5s for typical repos | high | medium | data-model.md |
| E8 | ULID generation is collision-free for single-user scenario | high | low | data-model.md |
| E9 | Session seq counter (INTEGER) won't overflow in practice (<2B events/session) | high | low | event-system.md |
| E10 | `datetime('now')` always returns UTC; client handles timezone conversion | high | low | data-model.md |

---

## F. Process & Lifecycle Management

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| F1 | SIGTERM + 5s timeout + SIGKILL reliably terminates all agent subprocesses | high | high | agent-provider-interface.md, providers/* |
| F2 | Bun.spawn() with stdin/stdout: "pipe" creates reliable streams until process exit | high | medium | providers/claude-code.md |
| F3 | Exit event is always emitted; no session reaches "running" without eventually exiting | medium | critical | agent-provider-interface.md |
| F4 | start() and stop() are idempotent; double-call is safe | medium | high | agent-provider-interface.md |
| F5 | Permission response awaits indefinitely; no timeout needed (user always responds eventually) | medium | high | providers/claude-code.md |
| F6 | instance_id is unique per server instance; no two instances run simultaneously | high | critical | data-model.md |
| F7 | Orphaned sessions can be safely marked failed or resumed on server restart | medium | high | data-model.md, interaction-flows.md |
| F8 | worktree_path persists on disk and is valid after server restart | medium | medium | data-model.md |
| F9 | 1 task = max 1 active session constraint is enforceable at application layer | high | critical | information-architecture.md, data-model.md |

---

## G. WebSocket & Real-Time

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| G1 | WS push latency is <100ms for perceived "real-time" UX | high | high | interaction-flows.md |
| G2 | WS reconnection + state replay completes within ~2s | medium | high | interaction-flows.md, event-system.md |
| G3 | Browser maintains WS connection for hours without proxy/LB timeout | medium | medium | event-system.md |
| G4 | Context % update frequency doesn't overwhelm WS broadcast queue | medium | medium | interaction-flows.md |
| G5 | WsMessage discriminant `type` is sufficient for client-side routing | high | medium | event-system.md |
| G6 | State updates via WS are atomic per message (no partial state visible) | high | low | event-system.md |

---

## H. Mobile & PWA

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| H1 | Web Push API is available and reliable on iOS 16+ and Android | medium | high | interaction-flows.md, user-stories.md |
| H2 | PWA push permission persists across app close/reopen | high | medium | interaction-flows.md |
| H3 | Mobile inline buttons ([Approve]/[Deny]) are touch-friendly at card width | medium | medium | screen-inventory.md |
| H4 | PWA service worker handles offline → reconnect gracefully | medium | medium | interaction-flows.md |
| H5 | Mobile viewport >= 280px is sufficient for Needs Attention card layout | high | low | screen-inventory.md |

---

## I. UX & Display

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| I1 | 5-7 card fields are sufficient for status assessment without drill-down | medium | high | screen-inventory.md, user-stories.md |
| I2 | Color dot (green/orange/red) + text label is accessible (including color-blind users) | medium | medium | screen-inventory.md |
| I3 | "Needs Attention" section at top prevents overlooking permission/failure | medium | medium | screen-inventory.md |
| I4 | Dashboard renders 20+ cards in <500ms | high | medium | screen-inventory.md |
| I5 | Timeline with 100+ events doesn't cause DOM explosion (lazy loading needed?) | medium | medium | screen-inventory.md |
| I6 | "Session" concept is never exposed to users; only "task" and "run attempt" | high | low | information-architecture.md |
| I7 | Client-side elapsed time (now - started_at) matches server within +/-5s | high | low | information-architecture.md |

---

## J. Permission & Auto-Approve

| ID | Assumption | Confidence | Risk | Source |
|----|-----------|------------|------|--------|
| J1 | auto_approve_rules are session-scoped and cleared on session exit | high | critical | event-system.md, information-architecture.md |
| J2 | minimatch() correctly matches glob patterns for auto-approve | high | medium | event-system.md |
| J3 | Duplicate permission responses (user + auto) cannot race | medium | high | event-system.md |
| J4 | Permission request payload contains enough info (tool, file, diff) for judgment | medium | medium | information-architecture.md, screen-inventory.md |
| J5 | context_warning notification deduplication prevents spam at 90% threshold | high | medium | event-system.md |

---

## PoC Coverage Matrix

Which PoC validates which assumptions.

| PoC | Assumptions Covered | Not Covered (need separate validation) |
|-----|-------------------|---------------------------------------|
| poc-claude-code-hooks | A1-A8 | — |
| poc-codex-app-server | B1-B6 | — |
| poc-acp-connection | C1-C6 | — |
| poc-terminal-relay | D1-D11 | — |
| poc-event-ledger | E1-E5, E9 | E6-E8, E10 (trivial / high confidence) |
| (no dedicated PoC) | F1-F9 | Process mgmt — verified during integration |
| (no dedicated PoC) | G1-G6 | WS — verified during terminal-relay + event-ledger PoC |
| (no dedicated PoC) | H1-H5 | PWA — verified post-MVP with real device |
| (no dedicated PoC) | I1-I7 | UX — verified by design review + user testing |
| (no dedicated PoC) | J1-J5 | Permission — verified during integration |

---

## Priority Order for PoC Execution

Based on risk * (1 - confidence). Highest uncertainty + highest risk first.

| Priority | PoC | Rationale |
|----------|-----|-----------|
| 1 | poc-codex-app-server | B1-B2 are low confidence + critical risk. Undocumented API |
| 2 | poc-acp-connection | C3, C6 are low confidence. Protocol may not exist in testable form yet |
| 3 | poc-claude-code-hooks | A4 (MCP permission) is low confidence + critical. A1-A3 are medium |
| 4 | poc-terminal-relay | D1 (restty) is low confidence + high risk. Browser compatibility unknown |
| 5 | poc-event-ledger | E1-E2 are medium confidence + high risk. SQLite behavior is well-documented but load profile is specific |

---

## Summary

| Category | Total | Critical Risk | Low Confidence |
|----------|-------|---------------|----------------|
| A. Claude Code | 8 | 2 (A1, A4) | 1 (A4) |
| B. Codex | 6 | 2 (B1, B2) | 3 (B2, B4, B5) |
| C. ACP | 6 | 2 (C1, C6) | 3 (C3, C4, C6) |
| D. Terminal | 11 | 0 | 1 (D1) |
| E. Event Ledger | 10 | 1 (E4) | 0 |
| F. Process | 9 | 3 (F3, F6, F9) | 0 |
| G. WebSocket | 6 | 0 | 0 |
| H. Mobile/PWA | 5 | 0 | 0 |
| I. UX | 7 | 0 | 0 |
| J. Permission | 5 | 1 (J1) | 0 |
| **Total** | **73** | **11** | **8** |
