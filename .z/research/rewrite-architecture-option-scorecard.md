# banto Rewrite Architecture Option Scorecard (Non-Final)

Date: 2026-03-07
Status: Working draft for decision-making, not a fixed architecture.

## Goal

Use broad competitor research to decide what to adopt for banto rewrite, what to avoid, and how to validate architecture options before locking major decisions.

## Scope and Assumptions

- Hard constraints for this draft:
  - Single-user
  - Self-hosted and local-first
  - Browser-first control surface
  - SQLite as primary persistence
- Not hard constraints in this draft:
  - Provider lock-in ("CC only")
  - OS lock-in ("NixOS only")
- Decision mode:
  - Prefer reversible architecture choices
  - Avoid locking into unvalidated conclusions

## Decision Principles

1. Optimize for human supervision throughput, not raw generation speed (`github-copilot-agent.md`, `composio.md`, `devin.md`).
2. Preserve trustworthy live state over feature breadth (`happy-coder.md`, `cmux.md`, `vde-monitor.md`).
3. Keep execution state durable and replayable (`gob.md`, `openhands.md`, `zeroshot.md`).
4. Make intervention and review first-class (`github-copilot-agent.md`, `superset.md`).
5. Defer high-complexity orchestration until reliability metrics are green (`composio.md`, `claude-code-first-party.md`, `zeroshot.md`).

## Adoption Matrix

| Pattern | Evidence of success | Known failure modes | banto adaptation | Confidence |
|---|---|---|---|---|
| Isolated workspace per session | Core parallelism primitive in multiple tools (`claude-squad.md`, `superset.md`, `crystal-nimbalyst.md`) | Worktree env drift, cleanup races (`claude-squad.md`, `superset.md`) | Pluggable runtime: `local-process`, `worktree`, `container`; setup/teardown contracts | High |
| Durable session host (daemon semantics) | Session continuity valued (`superset.md`, `gob.md`) | Broken resume and orphan leaks (`zeroshot.md`) | Server owns lifecycle; instance IDs and boot-time reconciliation | High |
| Event ledger + projections | Strong replay/recovery model (`openhands.md`, `zeroshot.md`, `gob.md`) | Projection drift if events are weakly typed | Append-only `session_events` + deterministic projector tests | High |
| Hook + heartbeat + enrichment | Enables one-glance triage (`marc-nuri-dashboard.md`, `superset.md`) | Hook drift, stale status | Multi-signal status with confidence and freshness fields | High |
| Attention-first session cards | Actionable triage is highest UX value (`marc-nuri-dashboard.md`, `cmux.md`) | False status destroys trust (`happy-coder.md`) | Card schema: intent, blocker, freshness, review-readiness | High |
| Push notifications with deep links | Enables throw-and-forget workflow (`happy-coder.md`) | Dropped notifications and spam (`cmux.md`, `happy-coder.md`) | Always persist notifications; summary bus for aggregation | High |
| Live steering controls | Most praised mission-control capability (`github-copilot-agent.md`) | No interrupt path causes long loops (`openhands.md`, `devin.md`) | Mandatory controls: message, approve, pause, kill | High |
| Diff-first review | Review speed drives shipping speed (`composio.md`, `github-copilot-agent.md`) | Heavy diff UI can freeze (`superset.md`) | Lightweight server-side summary first, progressive detail loading | High |
| Plan-first task contract | Better alignment before execution (`devin.md`, `claude-code-first-party.md`) | Overhead on trivial tasks | Require contract only for medium+ tasks | High |
| Post-run validator pass | Reduces self-confirmation bias (`zeroshot.md`, `github-copilot-agent.md`) | Cost and complexity blow-up (`zeroshot.md`) | Optional validator mode by complexity/risk policy | Medium |
| Session fork and compare | Valuable exploration workflow (`agent-deck.md`, `crystal-nimbalyst.md`) | Review bottleneck explosion (`composio.md`) | Fork cap + compare view + explicit winner selection | Medium |
| Cost telemetry | Repeated top complaint in competitors (`amp.md`, `openhands.md`, `github-copilot-agent.md`) | Inaccurate estimates reduce trust | Per-session burn, rolling budget, threshold alerts | High |
| Provider adapter boundary | Future flexibility (`agentos.md`, `superset.md`) | Maintenance burden and routing bugs (`zeroshot.md`) | Keep adapter boundary, but start with narrow provider set | Medium |

## Countermeasure Matrix (Competitor Pain -> banto Prevention)

| Poorly rated outcome | Root cause | Preventive mechanism | Guardrail | Verification metric |
|---|---|---|---|---|
| Cold boot stop-go UX (`github-copilot-agent.md`) | Ephemeral runner startup | Warm session path + reusable runtime contexts | Show hot/warm/cold state before start | P95 start-to-first-output < 8s |
| Wrong status shown (`happy-coder.md`, `agentos.md`) | Heuristic-only state | Multi-source fusion with confidence | Display confidence + last signal age | Status accuracy > 95% on replay suite |
| Permission UX confusion (`happy-coder.md`) | Untyped generic payload UI | Typed permission schema | Risk-labeled approve/deny UI | Permission action failure < 1% |
| Session lost after crash (`superset.md`, `gob.md`) | Incomplete persistence model | Event ledger + checkpoint and recovery index | Recovery banner + replay timeline | Recovery success > 98% |
| Resume fails (`zeroshot.md`) | Missing resumable invariants | Explicit lifecycle state machine + resume preconditions | Block invalid resume with clear reason | Resume success > 95% on forced-failure tests |
| Drift/loop behavior (`devin.md`, `composio.md`) | No scope checks during run | Scope monitor + intent delta checks | One-click nudge/pause/kill | Drift incidents per 100 sessions (downward trend) |
| Review backlog (`github-copilot-agent.md`, `composio.md`) | Execution outpaces review | Risk-prioritized review queue | “Needs review” panel sorted by risk | Median review latency < 10 min |
| Large diff UI lag (`superset.md`) | Heavy client rendering | Server chunking + virtualized file list | Collapse unchanged by default | P95 diff render < 1.5s |
| Notification loss when focused (`cmux.md`) | Suppression coupled with storage | Store-all notification model | Suppress sound only, never state | Missing-notification incidents = 0 |
| Notification spam (`vde-monitor.md`) | No aggregation | Summary bus + debounce windows | Merge oscillation bursts into one alert | Alert volume per session within target band |
| Wrapper/env conflicts (`superset.md`) | Shell override side effects | Non-invasive launch path and explicit env allowlist | Effective-env inspector | Wrapper-related startup failures < 1% |
| Mobile keyboard/scroll breakage (`agentos.md`) | Desktop-first assumptions | Mobile interaction model and viewport-safe layout | Release gate with real-device test matrix | Mobile action success > 95% |

## Architecture Option Packages (Non-Final)

### Option A: Conservative Reliability-First

- Components:
  - Task API
  - Session Orchestrator (single-agent)
  - Workspace Runtime Adapter (local-process default)
  - Event Store + Session Projector
  - Review Service (diff/test summary)
  - Notification Service
- Data model:
  - Immutable `session_events`
  - Materialized `sessions` state
  - Task-level denormalized review stats
- Realtime protocol:
  - SSE for structured events
  - WebSocket for terminal/control only
- Best fit when:
  - Reliability and recoverability are top priority
- Main risks:
  - Lower differentiation vs advanced orchestration products

### Option B: Balanced

- Components:
  - Everything in A
  - Provider Adapter boundary (limited providers)
  - Validator Worker (post-run checks)
  - Policy Engine (budget/scope/approval)
- Data model:
  - Add validator outcomes and policy decisions to event stream
  - Lightweight task dependency DAG support
- Realtime protocol:
  - WebSocket event bus for app clients with SSE fallback
- Best fit when:
  - Need quality and control improvements without full orchestrator complexity
- Main risks:
  - More moving parts and higher testing burden

### Option C: Aggressive Differentiator

- Components:
  - Everything in B
  - Multi-agent coordination layer
  - Parallel validator mesh
  - Reactions/automation engine
  - Optional relay for cross-host continuity
- Data model:
  - Session lineage graph (parent/fork/subtask links)
  - Cost ledger and orchestration graph replay
- Realtime protocol:
  - Unified command/event fabric over WebSocket streams
- Best fit when:
  - Throughput gain from parallel orchestration is proven in practice
- Main risks:
  - Highest complexity, cost spikes, and review bottlenecks

## Weighted Scorecard (Weekly)

Use this scorecard to pick A/B/C based on evidence, not intuition.

### Weights

| Dimension | Weight |
|---|---:|
| Reliability (crash recovery, lifecycle correctness) | 25 |
| Human supervision throughput (triage + review speed) | 20 |
| State trustworthiness (status correctness, freshness) | 15 |
| Intervention quality (steering, stop semantics) | 10 |
| Cost predictability and visibility | 10 |
| Implementation complexity (lower is better) | 10 |
| Extensibility (runtime/provider optionality) | 10 |

Total: 100

### Scoring Method

- Score each dimension 1-5 per option weekly.
- Weighted score = sum(weight * score / 5).
- Use hard gates (below) before considering total score.

### Hard Gates

If any gate fails, the option is not eligible that week.

1. Lifecycle correctness: no unresolved data-loss class bug.
2. P95 start-to-first-output <= 12s.
3. Status accuracy >= 93% on replay suite.
4. Hard stop action has 100% deterministic termination in tests.

## 4-Week Validation Plan with Kill Criteria

### Week 1: Reliability Baseline

- Experiments:
  - Crash/restart recovery drills (forced kill, power-loss simulation)
  - Status-fusion replay tests from captured sessions
- Kill criteria:
  - Recovery success < 95% -> reject Option C immediately
  - Status accuracy < 93% -> block any automation expansion

### Week 2: Supervision Throughput

- Experiments:
  - Attention-first list ranking vs baseline list
  - Mid-task steering latency and success tests
- Kill criteria:
  - P95 steering latency > 3s -> postpone B/C features
  - Review median not improved by >= 25% -> keep A focus

### Week 3: A vs B Test

- Experiments:
  - Enable post-run validator for half of medium-risk tasks
  - Evaluate defect escape, review time, and cost impact
- Kill criteria:
  - Quality lift < 15% or cost increase > 20% -> prefer A

### Week 4: C Feasibility Check (Optional)

- Experiments:
  - Controlled session fork (max 3) and compare workflow
  - Optional cross-host continuity trial
- Kill criteria:
  - Review queue delay doubles -> reject C for now
  - Reconnect success < 97% -> postpone relay work

## Decision Output Template (Fill Weekly)

```md
Week: YYYY-MM-DD

Hard Gates:
- Gate 1: pass/fail
- Gate 2: pass/fail
- Gate 3: pass/fail
- Gate 4: pass/fail

Scores:
- Option A: XX/100
- Option B: XX/100
- Option C: XX/100

Decision:
- Selected path for next week:
- Deferred items:
- New risks observed:
```

## Recommendation Right Now (Provisional)

- Start from Option A baseline implementation with Option B interfaces prepared.
- Do not commit to Option C until Week 4 data proves net gain after review bottleneck and cost impact.

## Week 1 Execution Checklist (Concrete)

### Deliverables

1. Session lifecycle state machine document (single source of truth).
2. Minimal event schema v0 for lifecycle and attention signals.
3. Recovery harness that simulates crash/restart and validates reconciliation.
4. Baseline status-accuracy replay suite from recorded traces.

### Required Event Types (v0)

- `session.created`
- `session.started`
- `session.status.changed`
- `session.heartbeat`
- `session.attention.required`
- `session.message.sent`
- `session.message.ack`
- `session.stop.requested`
- `session.stopped`
- `session.failed`
- `session.recovered`

### Event Payload Minimum Fields

- `event_id` (monotonic sequence per session)
- `session_id`
- `task_id`
- `occurred_at`
- `source` (`hook` | `runtime` | `system`)
- `confidence` (`high` | `medium` | `low`)
- `payload` (JSON object)

### Recovery Test Scenarios

1. Process crash during running state.
2. Server restart during waiting-permission state.
3. Stop requested, then immediate server kill.
4. Restart with stale heartbeat but active process.

Expected: no duplicate active sessions, no orphaned running session without owner, deterministic final state.

### Metrics to Capture During Week 1

- `start_to_first_output_ms`
- `status_accuracy_pct` (against replay ground truth)
- `recovery_success_pct`
- `orphan_session_count`
- `stop_determinism_pct`

### Week 1 Exit Criteria

- `recovery_success_pct >= 95`
- `status_accuracy_pct >= 93`
- `orphan_session_count = 0` after reconciliation run
- `stop_determinism_pct = 100`

If any exit criterion fails, remain in reliability hardening and do not move to Option B/C work.

## Open Questions to Resolve Before Locking Architecture

1. Runtime default for v1: `local-process` vs `worktree` vs `container`.
2. Provider scope for v1.5: one provider vs two-provider fallback.
3. Validator trigger policy: complexity-based vs risk-based vs manual only.
4. Notification channel baseline: in-app only vs browser push in v1.
5. Session continuity boundary: single host only vs optional relay.

## Source Coverage

Primary inputs: `claude-squad.md`, `superset.md`, `gob.md`, `cmux.md`, `happy-coder.md`, `agentos.md`, `agent-deck.md`, `marc-nuri-dashboard.md`, `github-copilot-agent.md`, `devin.md`, `openhands.md`, `zeroshot.md`, `composio.md`, `vde-monitor.md`, `praktor.md`, `amp.md`, `claude-code-first-party.md`, `competitor-tools.md`.
