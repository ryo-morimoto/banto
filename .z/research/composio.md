# Composio Agent Orchestrator Research

Date: 2026-03-07
Sources:
- https://github.com/ComposioHQ/agent-orchestrator

Agentic orchestrator for parallel coding agents. Plans tasks, spawns agents, and autonomously handles CI fixes, merge conflicts, and code reviews. Open-sourced Feb 2026 by Composio (3.1k+ stars).

---

## Overview

Agent Orchestrator manages fleets of AI coding agents working in parallel. Each agent gets its own git worktree, branch, and PR. When CI fails, the agent fixes it. When reviewers leave comments, the agent addresses them. Humans are pulled in only when judgment is needed.

The project originated as ~2,500 lines of bash scripts managing tmux sessions and git worktrees. In 8 days, 30 Claude agents rebuilt it into ~40,000 lines of TypeScript with 17 plugins and 3,288 tests. 84% of the 102 PRs were authored by AI sessions. Every commit has `Co-Authored-By` trailers identifying the model (Opus for architecture, Sonnet for volume work).

The orchestrator itself is an AI agent -- not a dashboard or cron job. It reads the codebase, decomposes features into parallelizable tasks, assigns each to a coding agent, monitors progress, reads PRs, and makes routing decisions.

---

## Architecture

### Plugin-Based (8 Swappable Slots)

| Slot       | Default      | Alternatives              |
|------------|-------------|---------------------------|
| Runtime    | tmux        | Docker, Kubernetes, process |
| Agent      | claude-code | Codex, Aider, OpenCode    |
| Workspace  | worktree    | clone                     |
| Tracker    | GitHub      | Linear                    |
| SCM        | GitHub      | --                        |
| Notifier   | desktop     | Slack, Composio, webhook  |
| Terminal   | iTerm2      | web                       |
| Lifecycle  | core        | --                        |

All interfaces are TypeScript. Plugins are replaceable independently.

#### Plugin Interface Types (`packages/core/src/types.ts`)

```typescript
export type PluginSlot =
  | "runtime"
  | "agent"
  | "workspace"
  | "tracker"
  | "scm"
  | "notifier"
  | "terminal";

export interface PluginManifest {
  name: string;
  version: string;
  slot: PluginSlot;
  description?: string;
  author?: string;
  license?: string;
  main: string;
  dependencies?: Record<string, string>;
}

export interface PluginModule {
  create(config: unknown): Promise<Runtime | Agent | Workspace | Tracker | SCM | Notifier | Terminal>;
}
```

#### Session State Type

```typescript
export interface Session {
  id: SessionId;
  projectId: string;
  status: SessionStatus;
  activity: ActivityState | null;
  branch: string | null;
  issueId: string | null;
  pr: PRInfo | null;
  workspacePath: string | null;
  runtimeHandle: RuntimeHandle | null;
  agentInfo: AgentSessionInfo | null;
  createdAt: Date;
  lastActivityAt: Date;
  restoredAt?: Date;
  metadata: Record<string, string>;
}
```

The `activity` field is populated by reading Claude's session files directly (not agent self-reporting), enabling external state detection without coupling to the agent's internals.

#### YAML Configuration Example (`agent-orchestrator.yaml`)

```yaml
port: 3000

defaults:
  runtime: tmux
  agent: claude-code
  workspace: worktree
  notifiers: [desktop]

projects:
  my-app:
    repo: owner/my-app
    path: ~/my-app
    defaultBranch: main
    sessionPrefix: app

reactions:
  ci-failed:
    auto: true
    action: send-to-agent
    retries: 2
  changes-requested:
    auto: true
    action: send-to-agent
    escalateAfter: 30m
  approved-and-green:
    auto: false
    action: notify
```

The `reactions` block is the declarative event-driven automation layer. Each reaction key maps to a GitHub/CI event, with `auto`, `action`, and escalation/retry policies.

### Dual-Layer Execution

- **Planner**: Decomposes high-level objectives into verifiable sub-tasks. Handles strategy.
- **Executor**: Handles tool interaction with specialized prompts. Different models can be used per layer.

This separation prevents "greedy decision-making" where LLMs skip planning steps.

### Session Lifecycle

1. Tracker retrieves issue
2. Workspace creates isolated git worktree with feature branch
3. Runtime spawns execution context (tmux session / container)
4. Agent receives task context and works autonomously
5. Terminal enables real-time observation
6. SCM generates PR with enriched context
7. Reactions trigger automated responses (CI failure -> agent fix, review comment -> agent address)
8. Notifier alerts human when judgment is needed

### Key Design Choices

- **Activity Detection**: Reads Claude's session files directly to determine state (generating, awaiting execution, idle, complete) rather than relying on agent self-reporting.
- **Managed Toolsets (Just-in-Time Context)**: Only routes necessary tool definitions to the agent based on the current workflow step. Prevents context window bloat.
- **Stateful Orchestration**: Maintains a structured state machine rather than relying on unstructured chat history. Enables resume-on-failure.
- **Correction Loops**: Tool call failures trigger specific recovery logic without losing mission progress.

### Configuration

YAML-based (`agent-orchestrator.yaml`). Auto-detected on `ao start`. Supports:
- Multi-project definitions with repo paths and default branches
- Reaction rules: CI failures (auto-retry up to N attempts), review comments (escalate after timeout), approved PRs (optional auto-merge)

### CLI

```
ao spawn <project> [issue]   # Create new agent session
ao send <session> "message"  # Direct instruction to agent
ao session ls|kill|restore   # Lifecycle management
ao status                    # All active sessions overview
ao dashboard                 # Web-based supervision
```

---

## Well-Regarded Features

### 1. CI Self-Correction

Agents automatically detect CI failures, read logs, and push fixes. All 41 CI failures across 9 branches were self-corrected (84.6% first-attempt success rate). One PR (ao-58) survived 12 CI failure cycles with zero human intervention.

### 2. PR-per-Agent Isolation

Each agent operates in its own git worktree with a dedicated branch and PR. No merge conflicts between parallel agents during active work. Clean separation of concerns.

### 3. Agent-Agnostic Design

Supports Claude Code, Codex, Aider, and OpenCode through a common plugin interface. Swappable without changing orchestration logic.

### 4. Runtime-Agnostic

tmux for local development, Docker/K8s planned for cloud. Process mode also available. The plugin architecture makes adding new runtimes straightforward.

### 5. Review Comment Handling

When GitHub reviewers leave comments, the agent reads them and pushes fixes. Cursor Bugbot provided 700 automated review comments; agents self-corrected 68% immediately.

### 6. Notification System

Desktop, Slack, Composio, and webhook notifiers. Humans only get pulled in when judgment is needed -- not for routine status updates.

### 7. Self-Building Demonstration

The project itself serves as proof: 30 agents rebuilt the system from bash to TypeScript in 8 days. This demonstrates the orchestrator's capability at scale.

---

## Poorly-Regarded Features / Pain Points

### 1. Mid-Session Agent Drift

Agents start solving the wrong problem, over-engineer simple fixes, or go down rabbit holes. The orchestrator currently lacks robust mid-session intent validation. Course correction before wasted time is a known gap.

### 2. Conflict Resolution Between Parallel Agents

When multiple agents edit the same files, manual intervention is required. No automatic reconciler exists yet. This is the fundamental coordination problem of parallel agent work.

### 3. Setup Complexity

From GitHub issues and SETUP.md troubleshooting:
- Worktree/clone creation failures (permissions, disk space)
- Git permission issues for agent operations
- Config file not found errors requiring manual intervention
- Port conflicts (no auto-increment -- issue #300)
- Codex sessions don't auto-update metadata (issue #167)

### 4. Limited Platform Support

- iTerm2 terminal plugin is macOS-only
- No Windows support (issue #264 open)
- Web terminal is an alternative but less mature
- Docker/K8s runtime not yet shipped

### 5. Stuck/Frozen Sessions

Agent sessions can get stuck or frozen, requiring manual investigation (messaging the agent, killing and respawning). No automatic deadlock detection.

### 6. Escalation Logic is Semi-Manual

Handoffs between agents, orchestrator, and humans remain semi-manual. The rules for "when should an agent ask for help" are basic timeout-based rules, not intelligent escalation.

### 7. Observability Gaps

Debugging multi-agent failures is difficult. LLM errors can snowball into tool failures and state corruption. Token consumption and cost visibility were noted as "sneaky problems." No OpenTelemetry integration yet.

### 8. Code Review Overhead at Scale

HN commenters note that running many parallel agents shifts the bottleneck to code review: "barely keeping up reviewing what one agent produces." The orchestrator automates execution but the review burden on the human scales linearly.

---

## User Feedback Summary

### Hacker News (Show HN: 47219229, Ask HN: 46993479)

- The Show HN thread had limited engagement (1 comment from the creator as of research date).
- The Ask HN thread on agent orchestrators revealed skepticism: "people trying to use herds of agents...would have been better off handling it serially." Consensus: orchestration works best for well-specified tasks in codebases with mature test suites.
- Multiple users manage only 2-4 agents simultaneously. Going beyond that hits coordination costs.
- Success correlates with strong architectural documentation that "constrains the generation."

### GitHub Issues (as of 2026-03-07)

Active development with issues spanning:
- Dashboard improvements (swarm creation, task creation without GitHub issues)
- API infrastructure (REST API, database, auth)
- Platform gaps (Windows support, port conflicts)
- Agent metadata sync issues (Codex plugin)

The issue tracker suggests the project is in early-but-active development. Core orchestration works but rough edges remain in non-happy-path scenarios.

### Tech Press

Generally positive coverage framing it as a step beyond brittle ReAct loops. MarkTechPost, i10x.ai, and others covered the open-source release. The "self-building" narrative generated significant interest.

### General Skepticism (Not Composio-Specific)

The broader community remains skeptical about multi-agent orchestration:
- Serial workflows often prove more efficient than parallel
- Integration conflicts at code boundaries are common
- Token/cost overhead is poorly understood
- The human review bottleneck doesn't disappear -- it shifts

---

## Learnings for banto

### What Users Actually Want

- **Orchestrator vs. Dashboard -- Different Products**: Agent Orchestrator is an autonomous orchestrator that makes decisions (task decomposition, agent assignment, CI reaction). banto is a supervision dashboard for a single developer. This is a fundamental difference in philosophy: AO says "remove the human from the operational loop"; banto says "give the human a single view into everything running." banto should not try to be an orchestrator. The value is in visibility, not autonomy.
- **Scale Expectations**: Real users manage 2-4 agents, not 30. banto's UI should be optimized for 3-8 concurrent sessions, not 30+. The "fleet management at scale" narrative is aspirational marketing, not typical usage.
- **Review is the Bottleneck, Not Execution**: At scale, code review becomes the constraint. banto should optimize for fast review workflows: diff view per session, quick approve/reject/redirect actions, session history showing what changed and why.

### Technical Design Lessons

- **Activity Detection via Session Files**: AO reads Claude's session files directly to determine agent state rather than relying on self-reporting. This is a practical technique banto could adopt for detecting session status (active, waiting for input, idle, complete).
- **Git Worktree Isolation is Standard**: Every parallel-agent tool uses git worktrees for isolation. banto should assume worktree-per-session as the default workspace model.
- **Plugin Architecture is Over-Engineered for Single-User**: AO's 8-slot plugin system makes sense for a multi-user, multi-team tool. banto targets one developer with a fixed stack (Claude Code). Plugin abstractions would be premature. Direct integration is simpler and more reliable.

### UX Pattern Lessons

- **Agent Drift is the Real Problem**: Mid-session drift (agents solving the wrong problem) is the #1 pain point across all orchestrator tools. banto's value could include: surfacing early signals of drift (e.g., file changes outside expected scope), making it trivial to course-correct (send message to session), and showing what the agent is actually doing in real-time (terminal view).
- **Cost/Token Visibility**: Token consumption across parallel sessions is a blind spot in most tools. banto could differentiate by showing per-session and aggregate token usage prominently.

### Business & Ecosystem Lessons

- **Reactions System is Worth Studying**: AO's reaction system (CI failure -> auto-fix, review comment -> auto-address, approved PR -> notify) is a well-designed pattern. banto could implement simpler reactions as optional automations without full orchestration: session errored -> notify, session completed -> show diff summary, session idle too long -> surface to user.
- **YAML Config for Reactions**: AO's YAML-based reaction configuration is clean and declarative. If banto adds automation rules, a similar declarative format would be appropriate.

---

## Sources

- [ComposioHQ/agent-orchestrator — GitHub Repository](https://github.com/ComposioHQ/agent-orchestrator)
- [Open-Sourcing Agent Orchestrator — Composio Blog (pkarnal.com)](https://pkarnal.com/blog/open-sourcing-agent-orchestrator)
- [The Self-Improving AI System That Built Itself — Composio Blog](https://composio.dev/blog/the-self-improving-ai-system-that-built-itself)
- [Composio Open Sources Agent Orchestrator — MarkTechPost](https://www.marktechpost.com/2026/02/23/composio-open-sources-agent-orchestrator-to-help-ai-developers-build-scalable-multi-agent-workflows-beyond-the-traditional-react-loops/)
- [Show HN: Agent Orchestrator — Hacker News](https://news.ycombinator.com/item?id=47219229)
- [Ask HN: Agent Orchestrators Discussion — Hacker News](https://news.ycombinator.com/item?id=46993479)
- [Agent Orchestrator Issue Tracker — GitHub Issues](https://github.com/ComposioHQ/agent-orchestrator/issues)
