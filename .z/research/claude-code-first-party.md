# Claude Code First-Party Features: Deep Research

Date: 2026-03-07

## Overview

Anthropic is rapidly building first-party features into Claude Code that overlap significantly with banto's scope. Three features are particularly relevant:

1. **Tasks** (shipped January 2026 in v2.1): Persistent, filesystem-based task lists with dependency graphs and cross-session state sharing.
2. **Agent Teams** (experimental, shipped ~February 2026): Multi-agent coordination with a team lead/teammate pattern, shared task lists, and inter-agent messaging.
3. **Remote Control** (shipped February 25, 2026): Mobile/web access to local Claude Code sessions via QR code or session URL.

Claude Code has hit a $2.5 billion annualized run rate as of February 2026. These features indicate Anthropic's trajectory: from CLI tool to full orchestration platform.

---

## Claude Code Tasks

### Architecture

**Storage:** Filesystem-based, UNIX-philosophy approach. Tasks are written to `~/.claude/tasks/<TASK_LIST_ID>/tasks.json`. Atomic writes use a rename-based pattern to prevent corruption.

**Dependency Model:** Directed Acyclic Graph (DAG). Tasks can explicitly block other tasks (e.g., "Run Tests" blocked until "Build API" and "Configure Auth" complete). This prevents hallucinated-completion errors common in LLM workflows.

**Session Scoping:**
- By default, each session has its own task list. Tasks disappear on `/clear` or session end.
- Setting `CLAUDE_CODE_TASK_LIST_ID` enables persistent, named task lists that survive session boundaries.
- Multiple Claude Code instances can point to the same task list ID for cross-session coordination.

**UI:** Tasks appear in the terminal status area (toggle with `Ctrl+T`). Up to 10 tasks visible at a time. Tasks persist across `/compact` operations, serving as a "memory anchor" when context is cleared.

**Opt-out:** `CLAUDE_CODE_ENABLE_TASKS=false` reverts to the old TODO list behavior. Enterprise teams can also set `CLAUDE_CODE_ENABLE_TASKS=false` via v2.1.19.

### Evolution: Todos to Tasks

The old "Todos" were chat-resident checklists -- lightweight reminders that helped Claude remember what to do within a session. Tasks are a fundamentally different abstraction: they represent work units with status, dependencies, and persistence. As Anthropic engineer Thariq Shihipar wrote: "Todos (orange) = 'help Claude remember what to do'." Tasks (green) are for "coordinating work across sessions, subagents, and context windows."

### Key Design Decisions

1. **Local-first:** No cloud database. Tasks are plain files on disk that can be audited, backed up, or version-controlled.
2. **Context economy:** Tasks solve the problem of losing project state when running `/clear` or `/compact`. The plan is externalized to disk, so context can be freed for reasoning.
3. **Hydration pattern:** Advanced users store project specs in markdown files and "hydrate" task lists from specs at session start, enabling project continuity across sessions.

### Filesystem Format

```
~/.claude/tasks/<TASK_LIST_ID>/tasks.json
```

```json
{
  "tasks": [
    {
      "id": "task_001",
      "title": "Build API endpoints",
      "status": "in_progress",
      "blocks": ["task_003"],
      "blockedBy": [],
      "createdAt": "2026-03-07T10:00:00Z"
    },
    {
      "id": "task_002",
      "title": "Configure Auth",
      "status": "completed",
      "blocks": ["task_003"],
      "blockedBy": [],
      "createdAt": "2026-03-07T10:00:00Z"
    },
    {
      "id": "task_003",
      "title": "Run Integration Tests",
      "status": "pending",
      "blocks": [],
      "blockedBy": ["task_001", "task_002"],
      "createdAt": "2026-03-07T10:01:00Z"
    }
  ]
}
```

**banto integration point**: Read `~/.claude/tasks/*/tasks.json` to display task state in the dashboard. Write to it to create tasks from the UI that Claude Code sessions can pick up.

### Agent Teams Config

```
~/.claude/teams/{team-name}/config.json
```

```json
{
  "name": "refactor-team",
  "members": [
    { "name": "lead", "agentId": "abc123", "agentType": "lead" },
    { "name": "backend", "agentId": "def456", "agentType": "teammate" },
    { "name": "tests", "agentId": "ghi789", "agentType": "teammate" }
  ]
}
```

### Environment Variables

```bash
# Persistent task list (survives session boundaries)
export CLAUDE_CODE_TASK_LIST_ID="my-project-tasks"

# Enable experimental Agent Teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Disable tasks (revert to old Todos)
export CLAUDE_CODE_ENABLE_TASKS=false
```

### Constraints

- Task sharing requires manual `CLAUDE_CODE_TASK_LIST_ID` coordination -- no automatic discovery.
- No built-in UI for browsing/managing tasks outside of the CLI session.
- Task list is a single JSON file -- no database, no indexing, no querying beyond what Claude provides.
- No web dashboard or historical view of completed tasks.
- No scheduling or cron-like execution of tasks.

### User Feedback

**Positive:**
- Context preservation across `/compact` and session restarts is widely praised as solving a real pain point.
- Filesystem persistence is appreciated by power users who want auditability.
- DAG-based dependencies prevent the "hallucinated completion" problem where agents claim tasks are done when they are not.

**Negative:**
- The system is invisible to users who do not know about `CLAUDE_CODE_TASK_LIST_ID`. Default behavior (session-scoped, ephemeral) means most users never experience the persistent mode.
- No visual dashboard -- you can only see tasks inside an active Claude Code session.
- Managing shared task lists across sessions requires manual environment variable coordination.

---

## Claude Code Agent Teams

### Architecture

**Components:**
| Component | Role |
|-----------|------|
| Team Lead | Main Claude Code session. Creates team, spawns teammates, coordinates work. |
| Teammates | Separate Claude Code instances, each with its own context window. |
| Task List | Shared, filesystem-backed task list for coordination. |
| Mailbox | Inter-agent messaging system. Supports direct messages and broadcasts. |

**Storage:**
- Team config: `~/.claude/teams/{team-name}/config.json` (members array with name, agent ID, agent type)
- Task list: `~/.claude/tasks/{team-name}/`
- File locking prevents race conditions when multiple teammates claim the same task.

**Display Modes:**
- **In-process:** All teammates run in the main terminal. Navigate with `Shift+Down`. Default mode.
- **Split panes:** Each teammate in its own tmux or iTerm2 pane. Requires tmux or iTerm2.

**Communication:**
- Teammates do NOT inherit the lead's conversation history.
- Messages are delivered automatically (no polling).
- Idle notifications inform the lead when a teammate finishes.
- Broadcast sends to all teammates (expensive -- scales with team size).

**Permissions:** Teammates inherit the lead's permission settings at spawn. Can be changed individually post-spawn.

### vs. Subagents

| | Subagents | Agent Teams |
|---|---|---|
| Context | Own window; results return to caller | Own window; fully independent |
| Communication | Report back to main agent only | Teammates message each other directly |
| Coordination | Main agent manages all | Shared task list, self-coordination |
| Best for | Focused tasks, result-only | Complex work, discussion, collaboration |
| Cost | Lower (summarized results) | Higher (each teammate = separate instance) |

### Key Features

- **Plan approval mode:** Teammates plan in read-only mode until the lead approves. Rejected teammates revise and resubmit.
- **Delegate mode:** Called "the most underappreciated feature" -- restricts the lead to coordination only, preventing it from doing work itself.
- **Hooks:** `TeammateIdle` and `TaskCompleted` hooks enforce quality gates.
- **Self-claiming:** After finishing a task, teammates auto-pick the next unassigned, unblocked task.

### Constraints

- **Experimental:** Disabled by default. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- **No session resumption:** `/resume` and `/rewind` do not restore in-process teammates.
- **One team per session.** No nested teams.
- **Lead is fixed:** Cannot promote a teammate or transfer leadership.
- **File conflicts:** Two teammates editing the same file causes overwrites. Requires file-disjoint task decomposition.
- **Task status lag:** Teammates sometimes fail to mark tasks complete, blocking dependent tasks.
- **Shutdown is slow:** Teammates finish current request before shutting down.
- **Split panes require tmux/iTerm2.** Not supported in VS Code terminal, Windows Terminal, or Ghostty.
- **Token costs scale linearly** with teammate count.

### User Feedback

**Positive:**
- "Completely different" experience from single-agent use. Multiple agents talking to each other "feels like looking into the future."
- Closed-loop correction: reviewer agent catches bugs and delegates fixes without human intervention.
- FastAPI 50k LOC refactor: 6 minutes with 4 agents vs. 18-20 minutes sequential (4x tokens).
- Anthropic stress test: 16 agents built a Rust-based C compiler (100k lines, builds Linux 6.9) in ~2000 sessions, ~$20k tokens.
- Adversarial review loops (implement + critique) reduce final review burden.

**Negative:**
- Cost is the #1 concern. 3-4x token cost for parallel execution. The C compiler project cost ~$20k.
- First-attempt large teams (frontend + backend + infra + SRE) fail due to coordination overhead, context bleeding, conflicting assumptions. Small, focused teams (2-3 agents) consistently outperform.
- Code quality issues persist: duplicated methods, ineffective tests, unnecessarily complex implementations. Cannot trust agents for independent large tasks.
- Context window exhaustion: agents "run out of context so quickly" without structured PLAN.md / PROGRESS.md files.
- Unexpected session termination leaves repos with conflicts and incomplete work.
- Some critics argue Anthropic incentivizes multi-agent patterns to increase token consumption rather than improving single-agent reliability.
- Human supervision remains the bottleneck -- validation cannot scale as fast as execution.

**Best Practices from Users:**
- Keep teams small (2-3) with narrow, file-disjoint scope.
- Plan-first is "non-negotiable." Enforce strict plan templates with plan mode.
- Use delegate mode to prevent the lead from doing work itself.
- Encode guidelines as reusable skills for consistency across agents.

---

## Claude Code Remote Control

### Architecture

**How it works:**
1. User runs `claude remote-control` or `/rc` in an existing session.
2. Claude Code registers with the Anthropic API via outbound HTTPS (no inbound ports opened).
3. The local process polls for work from the API.
4. User connects from phone/tablet/browser via session URL or QR code.
5. All traffic routes through Anthropic's API over TLS with short-lived, single-purpose credentials.

**Key principle:** Claude keeps running locally. The web/mobile interface is just a window into the local session. Local filesystem, MCP servers, tools, and project config remain available.

**Multi-surface sync:** Conversation stays in sync across terminal, browser, and phone. Messages can be sent from any connected surface interchangeably.

**Auto-reconnect:** If laptop sleeps or network drops (< 10 min), the session reconnects automatically.

### Configuration

- `claude remote-control [--name "My Project"] [--verbose] [--sandbox]`
- `/rc` from within an existing session (preserves conversation history)
- Can be enabled for all sessions via `/config` setting.
- Each Claude Code instance supports one remote session.

### Constraints

- **One remote session per instance.** Cannot manage multiple concurrent remote sessions.
- **Terminal must stay open.** Closing the terminal ends the session.
- **10-minute network timeout.** If the machine cannot reach the network for ~10 minutes, the session times out and exits.
- **No terminal access.** Remote Control shows the conversation, not a raw terminal. For arbitrary commands, SSH + tmux is still needed.
- **No session resumption.** If the session crashes, you start a new session (cannot reconnect to the old one).
- **`--dangerously-skip-permissions` does not propagate.** Every file write and shell command requires manual tap approval from the phone, which kills long-running agentic workflows.
- **Desktop app excluded.** Only works from Claude Code CLI, not the Desktop app.

### Availability

- Available on Pro, Max, Team, and Enterprise plans. Team and Enterprise admins must enable Claude Code in admin settings.
- Initially launched as Research Preview for Max tier ($100-$200/month) only; since expanded.
- API keys are not supported.

### User Feedback

**Positive:**
- "Genuine quality-of-life improvement, not just a gimmick" -- the ability to monitor and nudge sessions from a phone fills a real gap.
- Solves the "walked away from desk mid-session" problem that many developers experience daily.
- Security model (outbound-only, no open ports, TLS, short-lived credentials) is well-regarded.
- Works well for monitoring progress and simple approve/reject decisions.

**Negative:**
- Simon Willison: "a little bit janky right now" -- encountered access errors, API 500 errors, unclear session crash messages.
- Permissions friction is a dealbreaker for autonomous workflows. Every action needs a manual tap.
- Phone screen is impractical for detailed code review. Good for monitoring, bad for editing.
- Single-session limit becomes friction when managing multiple long-running jobs.
- iOS app is less consistent than the browser path.
- Users want session persistence: "it should keep running until the user stops it" rather than timing out.

**OpenClaw Controversy:**
- Some critics noted that "Anthropic made OpenClaw economically unviable and then shipped their own version of the same idea, better controlled and tied to their platform." Platform lock-in is real even if security improvements are genuine.

---

## banto Differentiation Strategy

### Where Claude Code first-party features fall short

1. **No unified dashboard.** Tasks, Agent Teams, and Remote Control are separate features with no single view. A developer running 5 agents across 3 projects cannot see everything at once.

2. **CLI-only management.** Tasks and Agent Teams are managed through the CLI. No web UI for browsing task history, reviewing session outcomes, or managing projects visually.

3. **No cross-project view.** Each task list is project-scoped. There is no "all projects, all tasks" overview for a developer managing multiple codebases.

4. **No persistent session history.** When sessions end, their conversation and diff history is gone (or buried in `~/.claude/`). No way to review what an agent did last week.

5. **No monitoring/alerting.** No notification when an agent finishes, errors, or needs attention (beyond the session itself). Remote Control helps, but only for one session at a time.

6. **Single-user, single-machine assumptions.** Agent Teams assume everything runs on one machine. Remote Control only bridges one session to one device. No concept of a persistent server that survives reboots.

7. **No scheduled or automated execution.** Cannot say "run this task every night" or "start this when I push to main."

### banto's positioning

banto is the **persistent orchestration layer** that Claude Code's first-party features cannot be:

| Capability | Claude Code Native | banto |
|---|---|---|
| Task visibility | CLI-only, per-session | Web dashboard, all projects at once |
| Multi-project overview | None | Single screen, all projects |
| Session history | Ephemeral | Persistent, reviewable |
| Monitoring | Remote Control (1 session) | All sessions, all the time |
| Execution lifecycle | Manual start/stop | Jot, throw, watch |
| Device access | Remote Control (1 session) | PWA, any device, all sessions |
| Server persistence | Must keep terminal open | Daemon on NixOS mini PC |
| Agent orchestration | Agent Teams (experimental) | CC-only, managed sessions |

### Strategic approach: Complement, don't compete

banto should NOT replicate Claude Code's internal features. Instead:

1. **Use Tasks API as coordination layer.** If Claude Code exposes task state via filesystem, banto can read/write `~/.claude/tasks/` to coordinate with running sessions without reinventing task management.

2. **Use Agent Teams when they stabilize.** banto can spawn agent teams and monitor their progress from the dashboard, rather than building custom multi-agent orchestration.

3. **Solve the dashboard problem.** Claude Code will never have a web dashboard. That is banto's core value: "one glance, all projects, all agents."

4. **Solve the persistence problem.** Claude Code sessions are ephemeral. banto's server runs continuously on the NixOS mini PC, surviving reboots and providing historical context.

5. **Solve the mobile problem better.** Remote Control bridges one session. banto's PWA shows all sessions, all projects, from any device.

---

## Learnings for banto

### What Users Actually Want

- **The "one session at a time" problem is real.** Every user feedback thread mentions wanting to monitor multiple sessions simultaneously. This is banto's primary value proposition. Do not compromise on multi-session visibility.
- **Remote Control validates the "watch from phone" use case.** Anthropic shipped exactly what banto envisions for mobile access, but limited to one session. This validates the use case while highlighting the gap banto fills (all sessions, all projects).
- **Human supervision is the bottleneck.** Users cannot validate agent output as fast as agents produce it. banto's "watch" phase should prioritize making review efficient -- showing diffs, highlighting changes, surfacing test results.
- **Agent coordination costs are high.** Agent Teams use 3-4x tokens for parallel execution. banto should surface cost tracking and help users make informed decisions about when to parallelize vs. serialize.

### Technical Design Lessons

- **Filesystem is the integration surface.** Claude Code chose `~/.claude/tasks/` as the state store. banto should treat these files as a first-class integration point rather than building a separate task database. Reading/writing Claude Code's native task format would make banto a natural companion rather than a replacement.
- **DAG-based task dependencies are table stakes.** Claude Code's move from flat todos to DAG-based tasks validates that dependency management matters. banto's task model should support dependencies from day one.

### UX Pattern Lessons

- **Small focused teams beat large scattered ones.** 2-3 agents with narrow scope consistently outperform 5+ agents. banto's UX should encourage focused task decomposition rather than unlimited parallelism.
- **Plan-first is non-negotiable for agent quality.** Without explicit plans, agents produce inconsistent, duplicated, or overly complex code. banto should enforce or encourage plan approval workflows before agent execution.

### Strategic Lessons

- **Do not build what Anthropic will ship.** Anthropic is rapidly iterating. Features that are experimental today (Agent Teams) will be stable within months. banto should build on top of Claude Code's features, not around them. The integration surface (filesystem, environment variables) is the durable layer.
- **The dashboard is the moat.** Claude Code will always be a CLI tool. Anthropic's web offerings (claude.ai/code, Remote Control) are conversation-first, not dashboard-first. A single-screen overview of all projects, tasks, and agent status is something Anthropic is unlikely to build, and it is exactly what a solo developer managing multiple parallel agents needs.

---

## Sources

### Official Documentation

- [Claude Code Tasks Documentation](https://code.claude.com/docs/en/tasks)
- [Claude Code Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Remote Control Documentation](https://code.claude.com/docs/en/remote-control)

### Articles & Blog Posts

- [VentureBeat: "Claude Code's Tasks Update Lets Agents Work Longer and Coordinate Across"](https://venturebeat.com/orchestration/claude-codes-tasks-update-lets-agents-work-longer-and-coordinate-across/)
- [Addy Osmani: "Claude Code Swarms" — Agent Teams guide](https://addyosmani.com/blog/claude-code-agent-teams/)
- [alexop.dev: "From Tasks to Swarms: Agent Teams in Claude Code"](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/)
- [claudefa.st: "Claude Code Agent Teams: The Complete Guide 2026"](https://claudefa.st/blog/guide/agents/agent-teams)
- [Northflank: "Claude Code: Rate limits, pricing, and alternatives"](https://northflank.com/blog/claude-rate-limits-claude-code-pricing-cost)

### User Feedback

- [Simon Willison on Remote Control](https://simonwillison.net/)
- [HN: Remote Control discussion](https://news.ycombinator.com/item?id=47148454)
