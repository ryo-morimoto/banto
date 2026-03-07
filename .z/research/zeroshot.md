# Zeroshot (covibes/zeroshot) Research

Date: 2026-03-07
Sources:
- https://github.com/covibes/zeroshot

Zeroshot is a CLI-based multi-agent orchestration tool. You point it at an issue (GitHub, GitLab, Jira, Azure DevOps) or inline text, and it autonomously plans, implements, validates, and iterates on code changes until they pass blind validation -- or rejects with actionable failures. It shells out to provider CLIs (Claude Code, Codex, Gemini CLI, OpenCode) rather than calling APIs directly, inheriting each CLI's tooling, permissions, and sandboxing.

---

## Overview

**Repo:** https://github.com/covibes/zeroshot
**Stars:** 1,276 | **Forks:** 103 | **Open Issues:** 55 | **License:** MIT
**Primary Language:** JavaScript (2.2M), Rust (472K for TUI), TypeScript (96K), Shell (35K)
**Created:** 2025-12-25 | **Last push:** 2026-03-05
**npm:** `@covibes/zeroshot`

Core value proposition: **blind validation**. The validator agents never see the worker's context or code history. They verify independently. This prevents the single-agent degradation problem where the model optimizes for "done" over "correct."

---

## Architecture

### Coordination Model: Message Bus + SQLite Ledger

The entire system is event-driven pub/sub over a SQLite-backed immutable event log.

```
Agent A --> publish() --> SQLite Ledger --> LogicEngine --> trigger match --> Agent B executes
```

**Key files:**
- `src/message-bus.js` -- Pub/sub layer over Ledger, includes WebSocket broadcasting
- `src/ledger.js` -- SQLite-backed append-only message log with indexes, WAL mode, prepared statements
- `src/logic-engine.js` -- VM-sandboxed JavaScript trigger evaluation (1s timeout, frozen prototypes)
- `src/orchestrator.js` -- Cluster lifecycle management, crash recovery, file-locked clusters.json

**Core primitives:**
- **Topic** -- Named message channel (ISSUE_OPENED, PLAN_READY, IMPLEMENTATION_READY, VALIDATION_RESULT, CLUSTER_OPERATIONS)
- **Trigger** -- Condition to wake an agent (`{ topic, action, logic }`)
- **Logic Script** -- JS predicate in a sandboxed VM for complex conditions
- **Hook** -- Post-task action (publish message, execute command)

**Takeaway**: SQLite-backed pub/sub is elegant — persistence, queryability, and crash recovery in one primitive. banto の session_events テーブルで同等のパターンを採用すべき。

### Task Pipeline: Conductor -> Planner -> Worker -> Validators Loop

**Step 1: Conductor Classification**
The conductor classifies each task along two dimensions:
- **Complexity:** TRIVIAL / SIMPLE / STANDARD / CRITICAL
- **TaskType:** INQUIRY / TASK / DEBUG

This 2D classification maps to a parameterized template via `config-router.js`:

| Complexity | Template        | Agents | Validators                                           |
|------------|-----------------|--------|------------------------------------------------------|
| TRIVIAL    | single-worker   | 1      | None                                                 |
| SIMPLE     | worker-validator| 2      | 1 generic                                            |
| STANDARD   | full-workflow   | 4      | 2 (requirements + code)                              |
| CRITICAL   | full-workflow   | 7      | Two-stage: quick (req+code) then heavy (security+adversarial) |

**Step 2: Planning (STANDARD+ only)**
- Planner agent reads ISSUE_OPENED + STATE_SNAPSHOT
- Outputs structured JSON: plan (numbered steps), acceptance criteria (AC1..ACn with MUST/SHOULD/NICE priority), files affected, risks
- Publishes PLAN_READY
- The plan is explicitly a "flat list of numbered steps" -- no phases, no alternatives, one decisive approach

**Step 3: Implementation**
- Worker agent reads ISSUE_OPENED + STATE_SNAPSHOT + PLAN_READY + previous VALIDATION_RESULTs
- Executes code changes autonomously (edits, writes, runs commands)
- Self-reports completion status with `canValidate: boolean` and `percentComplete`
- If `canValidate: false`, publishes WORKER_PROGRESS and re-triggers itself
- If `canValidate: true`, publishes IMPLEMENTATION_READY

**Step 4: Validation**
Validators run in parallel, each with blind context (no worker history):
- **validator-requirements**: Checks all acceptance criteria from the plan, runs repo's validation scripts, captures evidence (command + exit code + output)
- **validator-code**: Code quality review (error handling, test coverage, architecture)
- **validator-security** (CRITICAL only): OWASP, injection, auth/authz, secrets management
- **validator-adversarial** (CRITICAL only): Actually runs the code, tries to break it, verifies each requirement with real execution

Each validator outputs structured JSON: `{ approved: boolean, summary, errors[], criteriaResults[] }`

**Step 5: Iteration**
- If ANY validator rejects: worker receives all VALIDATION_RESULTs, gets a "you failed, fix it" subsequent prompt, and retries
- If ALL validators approve: cluster completes
- Max iterations configurable (default: 5)

**Two-stage validation for CRITICAL:**
A meta-coordinator agent manages staging:
1. Quick validation (requirements + code) runs first (~30-60s)
2. Only if quick passes, heavy validation (security + adversarial) runs (~120-180s)
3. This saves cost by not running expensive validators on obviously broken code

**Takeaway**: Blind validation (validators never see worker context) は Zeroshot の核心。banto でもセッション完了後に安価な検証パスを走らせるパターンを検討すべき。

**Takeaway**: Two-stage validation で安いチェックを先に走らせてコスト削減。banto は single-agent だが、完了後に cheap model で diff を検証する応用が可能。

### Model Selection by Complexity

| Complexity | Planner | Worker | Validators |
|------------|---------|--------|------------|
| TRIVIAL    | -       | level1 | -          |
| SIMPLE     | -       | level2 | level2     |
| STANDARD   | level2  | level2 | level2     |
| CRITICAL   | level3  | level2 | level2     |

Levels map to provider-specific models. The provider abstraction (`src/providers/`) resolves level -> model name for each CLI.

### Issue Backend Integrations

`src/issue-providers/` implements a provider pattern:
- `base-provider.js` -- Abstract base with shared detection logic
- `github-provider.js` -- `gh` CLI
- `gitlab-provider.js` -- `glab` CLI (cloud and self-hosted)
- `jira-provider.js` -- `jira` CLI
- `azure-devops-provider.js` -- `az` CLI

Auto-detection from git remote URL. Bare numbers (e.g., `zeroshot run 123`) automatically detect the provider. Priority: CLI flags > git remote > settings > GitHub fallback.

**Takeaway**: banto は CC-only なのでマルチプロバイダー不要だが、Issue バックエンドの自動検出パターン (git remote → provider) は参考になる。

### Isolation Modes

Three modes via `src/isolation-manager.js`:
- **None** (default): Agents modify files in the current directory
- **Git Worktree** (`--worktree`): Lightweight branch isolation, auto-enabled with `--pr`/`--ship`
- **Docker** (`--docker`): Full container isolation, git clone into fresh container, credential mounts

Docker supports configurable credential mounts (gh, git, ssh, aws, azure, kube, terraform, gcloud) and env var passthrough.

**Takeaway**: 3 段階の分離モード (none/worktree/docker) はユーザー選択肢として良い。banto は nixos-container 一択だが、credential mount パターンは採用すべき。

### Agent-Agnostic Provider Support

`src/providers/` has a clean per-provider structure:
- `anthropic/` (Claude Code)
- `openai/` (Codex)
- `google/` (Gemini CLI)
- `opencode/` (OpenCode)

Each provider implements: `cli-builder.js` (builds CLI commands), `models.js` (level -> model mapping), `output-parser.js` (parses streaming output), `index.js` (availability check, task execution).

Zeroshot shells out to the provider CLI rather than calling APIs directly. This is a deliberate design choice -- it inherits each CLI's auth, sandboxing, and tool permissions.

### Crash Recovery

All state persisted to SQLite. `clusters.json` tracks metadata with file locking (`proper-lockfile`). Resume at any time with `zeroshot resume <id>`. The orchestrator detects corrupted clusters (0 messages from SIGINT during init) and marks them for cleanup.

**Takeaway**: SQLite に全状態を永続化し resume 可能にする。banto のセッションも停電/OOM 後に再開できる設計にすべき。

### State Snapshotter (Durable Working Memory)

`src/state-snapshotter.js` derives a `STATE_SNAPSHOT` from structured outputs across the pipeline. Updated on ISSUE_OPENED, PLAN_READY, WORKER_PROGRESS, IMPLEMENTATION_READY, VALIDATION_RESULT. This gives every agent a compressed view of cluster state without replaying the entire ledger.

**Takeaway**: 長時間セッションでは context が爆発する。構造化スナップショットで「これまでの要約」を圧縮し、リトライ時に全履歴を再送しないパターンは banto に必須。

### Context Management

Sophisticated context budgeting system (`docs/context-management.md`):
- Context packs with priority levels (required > high > medium > low)
- Token budget (default 100K, configurable per complexity)
- Compact variants when budget is tight
- Defensive 500K char hard cap
- Sources configurable per agent via `contextStrategy`

### TUI

Rust (Ratatui) TUI communicates with Node backend over stdio using JSON-RPC. Two UI variants:
- **Classic**: Traditional pane-based layout
- **Disruptive**: Canvas-first spatial UI with "Fleet Radar" (clusters as orbs), "Agent Microscope" (single stream), spine-driven input, scrubbing timeline

The Disruptive TUI has had extensive development (issues #308-#361, ~20 issues worth of incremental build-up).

### Custom Cluster Topologies

The system is fully message-driven, so any agent topology is possible:
- Expert panels: parallel specialists -> aggregator -> decision
- Staged gates: sequential validators, each with veto power
- Hierarchical: supervisor dynamically spawns workers
- Dynamic: conductor adds agents mid-execution via CLUSTER_OPERATIONS

Custom clusters defined as JSON configs stored in `cluster-templates/`. Built-in validation checks for missing triggers, deadlocks, and invalid type wiring.

### Cluster Hooks

Python/JS scripts in `cluster-hooks/`:
- `block-ask-user-question.py` -- Prevents agents from asking questions (must be autonomous)
- `block-dangerous-git.py` -- Prevents dangerous git operations

### Data Flow

```
User Input (issue URL, .md file, inline text)
    |
    v
Issue Provider (GitHub/GitLab/Jira/Azure DevOps)
    |
    v
Conductor (classify: Complexity x TaskType)
    |
    v
Template Resolution (config-router.js -> base template + params)
    |
    v
Cluster Initialization (orchestrator.js)
  - Create SQLite ledger
  - Publish ISSUE_OPENED
  - Spawn agents per template
    |
    +---> Planner (reads ISSUE_OPENED, outputs structured plan)
    |       |
    |       v  PLAN_READY
    |
    +---> Worker (reads plan, executes code changes)
    |       |
    |       v  IMPLEMENTATION_READY (or WORKER_PROGRESS for self-loop)
    |
    +---> Validators (blind, parallel, each reads implementation independently)
    |       |
    |       v  VALIDATION_RESULT (approved: true/false)
    |
    +---> [If rejected] -> Worker gets VALIDATION_RESULT, retries
    |     [If approved] -> CLUSTER_COMPLETE
    |
    v
Optional: --pr (create PR) / --ship (PR + auto-merge)
```

### Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Shell out to provider CLIs | Inherits CLI auth, sandboxing, tools; no API key management |
| State persistence | SQLite per cluster | Crash recovery, atomic transactions, queryable ledger |
| Coordination | Pub/sub message bus | Decoupled agents, any topology possible |
| Trigger evaluation | VM-sandboxed JS | Complex conditions without full agent invocation |
| Isolation | Git worktree / Docker | Lightweight or full isolation, user choice |
| TUI | Rust (Ratatui) + Node backend over stdio | Performance (Rust rendering) + flexibility (Node for cluster ops) |
| Context management | Priority-based packing with token budget | Prevents context overflow, degrades gracefully |

---

## Well-Regarded Features

### Blind Validation (Core Differentiator)
The separation of implementation and validation is the foundational design insight. Validators never see worker context, preventing the "rubber stamp" problem of single-agent self-validation. The README positions this as the primary differentiator.

### Crash Recovery / Resume
Multiple users have tested and relied on `zeroshot resume`. Issue #438 (bug: resume doesn't work after stop) and #437 (feature request for resume after stopping) show users actively expecting and relying on this feature.

### Multi-Provider Support
Issue #439 requests using multiple providers simultaneously (auto-swap on usage limits, use different models for different roles). This shows users actively engaging with the multi-provider capability and wanting more from it.

### Git Worktree + PR Automation
The `--pr` and `--ship` flags with automatic worktree isolation and PR creation are a smooth workflow. The `--ship` flag (PR + auto-merge on approval) enables fully autonomous operation.

### Issue Provider Flexibility
GitHub, GitLab, Jira, Azure DevOps support with auto-detection from git remote. Users just paste an issue URL or number.

### Complexity-Based Scaling
Automatic scaling of agent count and model quality based on task complexity. TRIVIAL tasks use 1 cheap agent with no validation; CRITICAL tasks use 7 agents with two-stage validation. This is cost-aware by design.

### Disruptive TUI
Extensive investment in a spatial, canvas-first TUI (20+ issues, #308-#361). The "Fleet Radar" concept (clusters as orbs on a spatial canvas) and "Agent Microscope" (deep-focus single stream) show ambition for observability.

---

## Poorly-Regarded Features / Pain Points

### Resume is Broken (Issue #438, OPEN, bug)
User `da-wilky`: Ran a task, usage got exhausted, stopped the cluster, now `zeroshot resume` doesn't work. This is a critical workflow break -- the whole point of crash recovery is resume.

### Provider Lock-in Per Run (Issue #439, OPEN, enhancement)
User `Yelinz`: Cannot use multiple providers in a single run (e.g., Claude for planning, Codex for implementation). Cannot auto-swap when one provider's usage limit is hit. This is a natural extension of the multi-provider support.

### Model Rigidity via OpenCode (Issue #390, OPEN, enhancement)
User `jakob1379`: Cannot use arbitrary models through OpenCode. `zeroshot settings set maxModel kimi/kimi-k2-5` fails with "Invalid model." The level1/level2/level3 abstraction doesn't accommodate models outside the known set.

### Git-Pusher Hallucination (Issue #340, CLOSED, fixed)
The git-pusher agent hallucinated PR creation -- claimed it created and merged a PR when no git operations were executed. Fixed by adding `verify_github_pr` hook that validates PR exists via `gh pr view`. This exposed a silent error swallowing bug in hook execution.

### Detached Cluster Stop Doesn't Work (Issue #290, CLOSED, fixed)
`zeroshot stop` reported success but the daemon kept running and creating PRs. Dangerous in `--ship` mode.

### Preflight Simulation Gaps (Issue #418, CLOSED, fixed)
Preflight simulation only tested base templates, not resolved topologies. Git-pusher trigger failures kept recurring because the simulation didn't catch them.

### Windows Not Supported
README explicitly defers Windows (native/WSL) "while we harden reliability and multi-provider correctness."

### No Spec-Driven Development Integration (Issue #431, OPEN)
User `kundeng`: Wants harmony with spec-driven dev (BMAD / Spec-Kit / Kiro-style). Zeroshot's planning step generates plans dynamically, but there's no way to feed in pre-existing specifications or architectural documents as authoritative context.

### Cost Opacity
While there's a `maxModel` setting for cost ceilings, there's no real-time cost tracking visible to the user. The TUI shows token usage per role, but translating that to actual dollars requires external knowledge.

---

## User Feedback Summary

**User `da-wilky` (Issue #437/#438):**
> "I run zeroshot for a specific Task. Solving the task my claude usage gets exhausted, so I need to pause the execution and resume it later on. This doesnt work."

**User `Yelinz` (Issue #439):**
> "Is it possible to use multiple providers at once? Auto swap when one runs out of usage? Usage limits for one provider. Bias/opinion that one model is better at planning than implementing."

**User `jakob1379` (Issue #390):**
> "Cannot use kimi or any of the other models I have setup in OpenCode"

**User `kundeng` (Issue #431):**
> "Zeroshot already supports dynamic multi-agent orchestration, but spec-driven workflows could possibly be looped in as custom cluster logic"

**Maintainer `EivMeyer` (Issue #340 fix):**
> "git-pusher can no longer hallucinate PR creation." (After fixing with verify_github_pr hook + 6 unit tests for hallucination detection)

**Maintainer `tomdps` (multiple Disruptive TUI issues):**
> All 20+ Disruptive TUI issues follow the pattern "Completed via zeroshot cluster \<name\>" -- dogfooding Zeroshot to build Zeroshot.

---

## Learnings for banto

### What Users Actually Want

**Structured session completion** -- Don't just show "session ended." Parse the agent's final state into: what changed (files), what was tested, what's the confidence level. Zeroshot's `completionStatus` schema is a good reference.

**Session resume** -- Zeroshot's resume is broken right now (issue #438), which shows how critical and how hard this is. banto should design for resume from day 1 -- store enough state in the session_events table to reconstruct context.

**Cost visibility** -- Zeroshot tracks token usage per role but doesn't surface cost estimates well. banto should show cost per session (CC provides token counts, Anthropic publishes pricing).

**Task acceptance criteria** -- Zeroshot's planner generates testable acceptance criteria. For banto's "jot" flow, encouraging users to write what "done" means (even one sentence) would improve agent output quality significantly.

**Diff view for results** -- Zeroshot mentions SessionDiff. banto's design already includes this. Prioritize it -- it's how users verify "did the agent do the right thing."

**Task complexity classification** -- Auto-scaling resources based on task complexity is pragmatic. banto doesn't need 7 agents, but classifying tasks (trivial/simple/complex) to decide whether to run validation, how long to expect the session to take, and which model to use would improve the "jot, throw, watch" experience.

### Technical Design Lessons

**Event-driven coordination via SQLite ledger** -- Zeroshot's pub/sub over SQLite is elegant. Every message is persisted, queryable, and crash-safe. banto should use this pattern for session state. A `session_events` table with topic-based message routing would give: crash recovery for free, full audit trail of what happened, decoupled components, and the ability to "replay" a session's history.

**Blind validation is the key insight** -- The separation of "do the work" from "check the work" with context isolation is Zeroshot's strongest idea. For banto, even without multi-agent, the pattern of "after agent completes, run a separate validation pass that can't see the agent's reasoning" is worth exploring. It could be as simple as: after session completes, run a cheap model to verify the diff against the original task.

**Structured output from agents** -- Zeroshot forces agents to output structured JSON (plan, completion status, validation results with evidence). This makes the pipeline machine-readable. banto should require structured completion signals from sessions, not just "the agent stopped talking."

**State snapshots for context compression** -- Zeroshot's STATE_SNAPSHOT pattern (derive a structured summary, republish it, use it as context) prevents context explosion in long-running sessions. banto sessions that fail and retry need a compressed view of "what happened so far" rather than replaying the entire conversation.

**Crash recovery via persistent state** -- Everything in SQLite + resume. banto sessions should be resumable after crashes. Since banto is "throw at agent, walk away," the agent process could crash (power failure, OOM) and the user needs to resume.

### UX Pattern Lessons

**Observability is a deep rabbit hole** -- 20+ issues for a "disruptive" spatial TUI (Fleet Radar, Agent Microscope, scrubbing timeline). This is impressive engineering but represents massive investment in observability UX. banto's web dashboard is the right call -- a browser gives richer rendering than a terminal. But the lesson is: scope observability tightly.

**Complexity in configuration is a trap** -- Zeroshot's template system is powerful but creates a DSL users must learn. banto should keep configuration to an absolute minimum: task text, project, maybe model preference. That's it.

**Agent hallucination requires mechanical verification** -- Issue #340 shows agents can hallucinate entire workflows. Any action with side effects (git push, PR creation) needs mechanical verification, not trust in the agent's claim.

**Hard kill semantics for stop** -- Issue #290 (stop doesn't actually stop) is dangerous. banto's nixos-container approach should have hard kill semantics: if the user says stop, the container dies, period.

### Business & Ecosystem Lessons

**Shelling out to provider CLIs trades control for portability** -- Zeroshot shells out to `claude`, `codex`, `gemini` CLIs. This creates tight coupling to CLI interfaces that change frequently (output format, flags, auth). For banto, which targets CC-only, using the Agent SDK directly gives more control over the session lifecycle, streaming, and tool permissions. The CLI approach trades control for portability -- banto doesn't need portability.

**Over-engineered template systems emerge from multi-provider support** -- Zeroshot's cluster templates are essentially a DSL for agent topologies: JSON configs with template variables, conditional agents, hook transforms, dynamic spawning via CLUSTER_OPERATIONS. This is powerful but complex. banto's "jot, throw, watch" simplicity is an asset. One agent per session, one session per task. Don't add orchestration complexity unless users demand it.

**Multi-provider abstraction creates maintenance burden** -- Zeroshot's provider abstraction (4 providers, each with cli-builder/models/output-parser) is well-factored but creates maintenance burden. Users already hit issues (#390: can't use arbitrary models). banto's CC-only principle avoids this entirely.

**banto vs Zeroshot comparison:**

| Dimension | Zeroshot | banto (target) |
|-----------|----------|----------------|
| Input | Issue URL, .md file, inline text | Task jotted in dashboard |
| Agents | Multi-agent (planner + worker + validators) | Single agent per session |
| Validation | Blind multi-agent validation loop | User reviews results |
| Isolation | Git worktree / Docker / none | nixos-container |
| Provider | Claude, Codex, Gemini, OpenCode | CC only |
| UI | CLI + Rust TUI | Web dashboard (PWA) |
| State | SQLite per cluster | SQLite (bun:sqlite) |
| Core flow | Issue -> plan -> implement -> validate -> PR | Jot -> throw -> watch |

---

## Sources

- https://github.com/covibes/zeroshot
- https://github.com/covibes/zeroshot/issues/438 -- Resume broken after stop
- https://github.com/covibes/zeroshot/issues/439 -- Multi-provider per run
- https://github.com/covibes/zeroshot/issues/390 -- Model rigidity via OpenCode
- https://github.com/covibes/zeroshot/issues/431 -- Spec-driven development
- https://github.com/covibes/zeroshot/issues/340 -- Git-pusher hallucination
- https://github.com/covibes/zeroshot/issues/290 -- Detached cluster stop
- https://github.com/covibes/zeroshot/issues/418 -- Preflight simulation gaps
- https://github.com/covibes/zeroshot/issues/437 -- Resume feature request
- https://github.com/covibes/zeroshot/issues/308 -- Disruptive TUI (series start)
