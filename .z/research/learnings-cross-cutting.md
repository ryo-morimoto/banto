# Cross-Cutting Learnings Synthesis

Date: 2026-03-07
Sources:
- claude-squad.md, superset.md, zeroshot.md, openhands.md, crystal-nimbalyst.md, composio.md
- marc-nuri-dashboard.md, agent-deck.md, praktor.md, gob.md, cmux.md, agentos.md
- codex-orchestrator.md, happy-coder.md, devin.md, amp.md, github-copilot-agent.md, multi-agent-shogun.md

Synthesized learnings from all 18 competitor deep-research files. Each insight is validated by 2+ independent sources. Confidence rated by source count: HIGH (5+), MEDIUM (3-4), LOW (2).

---

## What Users Actually Want

### 1. Session isolation is table stakes (HIGH — 9 sources)

Every parallel-agent tool uses worktrees or container-level isolation. Users consistently cite isolation as the core reason to adopt these tools over raw terminal sessions. Claude Squad's worktree is its most praised feature; Crystal was built because of it.

**banto implication:** nixos-containers go further than worktrees — full env isolation including ports, node_modules, .env files. This solves Claude Squad's Issue #260 natively.

**Evidence:** claude-squad, superset, crystal-nimbalyst, composio, agent-deck, zeroshot, agentos, multi-agent-shogun, codex-orchestrator

### 2. Status at a glance — "which agent needs me?" (HIGH — 7 sources)

Users do not want to drill into details to understand state. The information must be on the list/card view: status (running/waiting/idle/error), git branch, context usage %, PR link.

**Evidence:** cmux (notification rings), marc-nuri-dashboard (context % as primary metric), happy-coder (StatusDot), agent-deck (4-state model), github-copilot-agent (Mission Control), composio (review is the bottleneck), crystal-nimbalyst (session identity must be visual)

### 3. Push notifications are essential for "throw and walk away" (HIGH — 6 sources)

Happy Coder quote: "I can finally leave my terminal knowing my agents are working." AgentOS's lack of push notifications is explicitly called out as a weakness.

**Evidence:** happy-coder (most valued feature), cmux (notification rings), agentos (gap), codex-orchestrator (--notify-on-complete), agent-deck (Telegram/Slack bridges), devin (Slack notifications)

### 4. Cross-session memory is a differentiator (HIGH — 5 sources)

Devin's cold-start-every-session problem is cited by multiple evaluators as the biggest gap. Amp's thread search is one of its most praised features. Praktor's per-agent SQLite memory with MCP tools is elegant.

**banto implication:** Accumulate project-level context across sessions. Past decisions, test results, learned patterns injected into new sessions.

**Evidence:** devin (biggest criticism: "amnesiac contractor"), openhands (no persistent memory), amp (thread search praised), praktor (per-agent memory.db), zeroshot (state snapshotter)

### 5. Cost/token visibility per session is demanded but poorly served (HIGH — 6 sources)

OpenHands: "$30 melted away in about an hour." Amp users feel anxious about every interaction costing money.

**banto implication:** Show per-session token usage and estimated cost on the dashboard. Local execution provides inherent cost predictability.

**Evidence:** openhands, amp, devin, zeroshot, composio, codex-orchestrator

### 6. Well-scoped tasks succeed; ambiguous tasks fail (HIGH — 5 sources)

Devin conclusion: agents excel at "clear, bounded, 4-8 hour junior-level tasks." The agent is not a senior engineer.

**banto implication:** Encourage task decomposition and acceptance criteria at jot time.

**Evidence:** devin (14/20 failures on ambiguous tasks), openhands (planning drift), github-copilot-agent (70-80% success rate), composio (serial often better than parallel), zeroshot (acceptance criteria improve outcomes)

### 7. Diff view is the review primitive (HIGH — 6 sources)

**Evidence:** claude-squad (diff tab praised), superset (Monaco diff viewer), zeroshot (SessionDiff), amp (agentic code review), github-copilot-agent (self-review before human), composio (review is bottleneck)

### 8. Mid-task steering prevents wasted work (HIGH — 5 sources)

OpenHands: "You must explicitly stop the task to give instructions." Copilot Mission Control's real-time steering is its most praised feature. banto's terminal-based approach naturally supports this.

**Evidence:** openhands, github-copilot-agent, codex-orchestrator, devin, amp

### 9. Realistic scale is 2-8 concurrent sessions (MEDIUM — 4 sources)

**Evidence:** composio (HN: real users manage 2-4 agents), marc-nuri-dashboard (5-10 sessions), multi-agent-shogun (4 Ashigaru practical ceiling), agent-deck (16-30 noted coordination as bottleneck)

---

## Technical Design Lessons

### 1. SQLite + event-sourced state is the validated persistence pattern (HIGH — 5+)

Anti-pattern: JSON file persistence (claude-squad: data loss on crash; codex-orchestrator: no queryability).

**banto implication:** session_events as append-only event log. State derived, never stored directly. seq-based ordering (not timestamps). Separate persistent events from ephemeral ones (thinking, heartbeat).

**Evidence:** openhands (V1 event-sourced), zeroshot (SQLite pub/sub ledger), gob (runs table + instance_id), praktor (SQLite WAL mode), happy-coder (seq-based, update vs ephemeral split)

### 2. Agent state detection via hooks/SDK, not terminal output parsing (HIGH — 5)

Anti-pattern: claude-squad's `CheckAndHandleTrustPrompt()` breaks on every Claude update. Codex Orchestrator's session-parser.ts requires constant maintenance.

**banto implication:** Use Claude Code hooks (PostToolUse, Stop, PermissionRequest) posting to Elysia HTTP endpoint. Structured JSON events, not text scraping.

**Evidence:** claude-squad, superset, cmux, codex-orchestrator, composio

### 3. Synchronous I/O on the UI event loop is the #1 performance killer (HIGH — 3)

claude-squad: TUI freezes 13 seconds from synchronous tmux capture-pane. Crystal: 40%+ CPU from git polling, 2800ms frame drops. Superset: CPU spikes with large diffs.

**banto implication:** All I/O (container operations, git commands, agent communication) must be async. WebSocket push, not polling. Worker threads for git diff generation.

**Evidence:** claude-squad, crystal-nimbalyst, superset

### 4. Session persistence across reboots requires server-side state (HIGH — 5)

Pattern: The server process IS the daemon. Lazy startup, idle reaping, max concurrent limits. Cold restore semantics (show last scrollback, let user decide).

**banto implication:** Elysia server is always running. SQLite persists all state. On restart, detect orphan sessions via instance_id, offer cold restore.

**Evidence:** claude-squad (tmux lost on reboot), superset (daemon for persistence), gob (PID + shutdown flag + instance_id), praktor (idle reaping + lazy startup), zeroshot (crash recovery via SQLite)

### 5. Container lifecycle: lazy start, idle reap, concurrency limits (MEDIUM — 3)

**banto implication:** Start nixos-containers on task assignment, not on server boot. Reap after configurable idle timeout. Enforce max concurrent sessions based on system resources.

**Evidence:** praktor (lazy startup, 10min idle timeout, max 5), superset (max 3 concurrent), multi-agent-shogun (max 10)

### 6. IPC between host and container: Unix domain socket for single-host (MEDIUM — 3)

**banto implication:** Bind-mount a Unix domain socket into nixos-containers. JSON protocol over the socket. Simpler and lower-latency than HTTP or embedded NATS.

**Evidence:** gob, praktor (recommends UDS for single-host), cmux (/tmp/cmux.sock)

### 7. Stuck/stale detection with simple heuristics (MEDIUM — 3)

Algorithm: if elapsed > average_duration + buffer AND no output for > threshold, mark as stuck. Surface visually, don't auto-terminate.

**Evidence:** gob (average + 1min), marc-nuri-dashboard (heartbeat + stale detection), agent-deck (4-state PTY pattern matching)

### 8. Denormalized statistics on parent entities (LOW — 2)

**banto implication:** Store run_count, success_count, total_duration_ms on tasks table. Update incrementally on session completion.

**Evidence:** gob (stats on jobs table), codex-orchestrator (tokens/files per job)

---

## UX Pattern Lessons

### 1. Dashboard as derived view, never source of truth (MEDIUM — 3)

**banto implication:** The React dashboard renders from session_events + task state via WebSocket. The dashboard never writes state — it only reads and displays.

**Evidence:** multi-agent-shogun (dashboard.md is secondary), gob (process/terminal separation), openhands (ConversationState derived from events)

### 2. Avoid scope creep into editor/IDE territory (MEDIUM — 3)

Crystal died because it tried to become a full IDE. cmux's "primitive, not a solution" philosophy succeeds.

**banto implication:** banto manages tasks and watches agents. It does not replace the editor. No built-in code editor, no built-in chat framework.

**Evidence:** crystal-nimbalyst, superset (massive complexity from bolted-on editor), cmux

### 3. Session grouping by project is critical (MEDIUM — 4)

Flat session lists become unmanageable with 5+ concurrent sessions. banto's project-based task model already addresses this.

**Evidence:** happy-coder, agent-deck, composio, agentos

### 4. Notification priority levels matter (MEDIUM — 3)

**banto implication:** Permission request = critical (immediate). Task complete = informational. Progress update = ambient. Different visual treatment and notification urgency.

**Evidence:** cmux, happy-coder, github-copilot-agent

### 5. Mobile/remote access validates PWA approach (HIGH — 4+)

macOS lock-in is the biggest complaint across 5 tools. banto's PWA on NixOS mini PC + Tailscale is the architecturally simplest path.

**Evidence:** agentos, happy-coder, marc-nuri-dashboard, cmux (macOS-only = 19 reactions)

### 6. Agent claims require mechanical verification (MEDIUM — 3)

Any action with side effects (git push, PR creation) needs mechanical verification, not trust in agent claims.

**Evidence:** zeroshot (hallucinated PR), devin (hallucinated features), github-copilot-agent (unintended edits)

---

## Business & Ecosystem Lessons

### 1. Maintenance sustainability is the existential risk (HIGH — 4)

claude-squad: part-time maintainers, "Project Seems Abandoned" (11+16 reactions). Crystal: deprecated after 8 months. happy-coder: "Still maintained?" (29 reactions). agent-deck: 22 versions in 3 months = scope creep.

**banto implication:** Keep architecture simple. Minimize moving parts. Resist feature creep. "jot, throw, watch" is the core.

### 2. Local execution on user hardware is a genuine differentiator (HIGH — 5)

Cloud execution pain: 90s cold boot (gh-copilot), cost explosion (openhands), privacy concerns (amp), mandatory login for local features (superset), unpredictable costs (devin).

**banto advantages:** No cold boot (always-on NixOS mini PC), no intermediary pricing, all data on user hardware, works offline.

### 3. Platform lock-in is a growth limiter (HIGH — 5)

macOS-only is the top complaint across cmux (19 reactions), superset (9+7 reactions), codex-orchestrator, crystal-nimbalyst, composio.

**banto:** Web-based PWA sidesteps this entirely.

### 4. CC-only (single provider) is correct for initial focus (MEDIUM — 4)

Multi-provider abstraction adds complexity without proportional value when only 2-3 models actually work well.

**Evidence:** crystal-nimbalyst (Claude-only worked), openhands (requires frontier in practice), zeroshot (multi-provider = maintenance burden), codex-orchestrator (tight coupling = simple)

### 5. The review bottleneck shifts, never disappears (HIGH — 4)

"Copilot makes writing code cheaper, but makes owning code more expensive." "Barely keeping up reviewing what one agent produces."

**banto implication:** Optimize for fast review workflows. Diff view, quick approve/reject, summary of what changed. The dashboard's value is in making review fast, not in making agents autonomous.

### 6. Setup/teardown scripts per project are needed (MEDIUM — 3)

**banto implication:** Support `.banto/setup.sh` and `.banto/teardown.sh` per project. nixos-containers handle dep isolation, but project-specific setup (copy .env, run migrations) still needs scripts.

**Evidence:** superset (.superset/config.json), claude-squad (Issue #260), composio (worktree setup failures)
