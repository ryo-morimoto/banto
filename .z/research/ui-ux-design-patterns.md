# AI Coding Agent Dashboard UI/UX Design Patterns

Date: 2026-03-07
Sources:
- https://blog.marcnuri.com/ai-coding-agent-dashboard
- https://github.com/BloopAI/vibe-kanban
- https://github.com/superset-sh/superset
- https://github.com/manaflow-ai/cmux
- https://github.com/slopus/happy
- https://github.com/saadnvd1/agent-os
- https://github.com/stravu/crystal (now Nimbalyst)
- https://ampcode.com/
- https://cursor.com/changelog/2-0
- https://devin.ai/
- https://ppaolo.substack.com/p/in-depth-product-analysis-devin-cognition-labs
- https://rywalker.com/research/mac-coding-agent-apps

Comparative analysis of 12 AI coding agent dashboards and monitoring tools, focused on visual layout, information hierarchy, and UX patterns. Research covers web dashboards, desktop apps, terminal-native tools, mobile clients, and IDE-based agents.

---

## Overview

The AI coding agent dashboard space has exploded in 2025-2026. Tools range from terminal multiplexers with status indicators to full web dashboards with kanban boards. This research catalogs the UI/UX patterns that work and those that do not, specifically for the "one glance" problem: how do you know what all your agents are doing right now?

Five distinct UI archetypes have emerged:

| Archetype | Examples | Strength | Weakness |
|---|---|---|---|
| **Three-panel workspace** | Devin, OpenHands | Rich context per session | Single-session focus, no multi-session overview |
| **Kanban + workspace** | Vibe Kanban, Nimbalyst | Task lifecycle visibility | Workspace view competes with board view |
| **Terminal + sidebar** | Superset, cmux | Familiar to CLI users, low overhead | Limited visual review, diff review is weak |
| **Session card dashboard** | Marc Nuri, AgentOS | Multi-session at-a-glance | Shallow per-session detail |
| **Thread gallery** | Amp, Claude Code Tasks | Shareable, explorable history | No real-time monitoring |

---

## Tool-by-Tool UI Analysis

### 1. Devin (devin.ai)

**Layout: Three-panel with timeline scrubber**

```
┌──────────┬─────────────────────┬───────────────────┐
│ Sessions │                     │  Workspace         │
│ (list)   │  Chat / Conversation│  ┌─────────────┐  │
│          │                     │  │ Shell        │  │
│ session1 │  [user message]     │  │ Browser      │  │
│ session2 │  [devin response]   │  │ Editor       │  │
│ session3 │  [user message]     │  │ Planner      │  │
│          │                     │  └─────────────┘  │
│          │                     │  [◀ timeline ▶]    │
└──────────┴─────────────────────┴───────────────────┘
```

- **Left panel**: Chronological session list. Child/batch sessions indented under parents. Inline PR previews, message snippets, status indicators (Feb 2026 redesign).
- **Center panel**: Chat conversation thread with the agent.
- **Right panel**: "Devin's Workspace" with 4 tabs: Shell, Browser, Editor, Planner. Devin's logo appears next to the active tab to show what the agent is currently doing. A "Following" toggle auto-switches tabs as Devin works.
- **Timeline scrubber**: Bottom bar with prev/next buttons to replay Devin's actions step by step. Clicking a timeline point scrolls the chat to the corresponding message.
- **Planning view**: Interactive plan review before autonomous execution. Devin presents relevant files, findings, and a preliminary plan. User can modify before approving.
- **"Grid layout"**: Alternative arrangement for monitoring-focused workflows.
- **One-glance**: Session list shows status indicators and PR previews. But the three-panel design focuses on one session at a time — multi-session overview is weak.

**Praised**: Interactive planning before execution; timeline scrubber for understanding agent actions; inline PR previews in session list.
**Criticized**: Sessions are isolated (no cross-session awareness); 24h auto-termination loses context; the workspace tabs can be disorienting when Devin switches rapidly.

---

### 2. Superset (superset.sh)

**Layout: Terminal emulator with workspaces sidebar + diff viewer**

```
┌────────────┬──────────────────────────────┐
│ Workspaces │                              │
│ (sidebar)  │  Terminal Pane(s)            │
│            │                              │
│ ⌘1 task-a  │  $ claude --resume ...       │
│ ⌘2 task-b  │                              │
│ ⌘3 task-c  │  ┌─────────┬──────────┐     │
│            │  │ pane 1  │ pane 2   │     │
│ [status]   │  │         │          │     │
│ [status]   │  └─────────┴──────────┘     │
│            │                              │
│ ⌘B toggle  │  ⌘L → Changes/Diff panel    │
└────────────┴──────────────────────────────┘
```

- **Workspaces sidebar (⌘B)**: Lists all agent workspaces, switchable via ⌘1-9 or ⌘⌥↑/↓. Status indicators show running/completed/waiting.
- **Terminal panes**: Split horizontally (⌘D) or vertically (⌘⇧D). Each workspace gets its own terminal with an isolated git worktree.
- **Changes panel (⌘L)**: Built-in diff viewer with syntax highlighting and side-by-side comparisons. Can edit files and stage specific hunks directly.
- **Monitoring panel**: Live status tracking for every active agent. Visual indicators for running/completed/waiting states.
- **Notifications**: macOS system notifications when agents need attention or complete work.
- **One-glance**: The workspaces sidebar gives a quick overview of all agent states. But the terminal-first design means you see raw terminal output, not structured information.

**Praised**: "Agent-first approach is really cool" (HN). Keyboard-driven workflow. Git worktree isolation eliminates conflicts. The diff viewer keeps review in-app.
**Criticized**: Electron-based (heavier than native). macOS-only (was; Linux support added later). Required cloud auth initially drew backlash. Terminal-only view lacks structured data extraction.

---

### 3. Nimbalyst / Crystal (stravu/crystal)

**Layout: Multi-panel workspace with plan/editor/sessions/canvas**

```
┌──────────────┬──────────────────────────────┐
│ File sidebar │                              │
│ + Sessions   │  Plan / Editor / Canvas      │
│              │                              │
│ plan.md      │  ┌─────────────────────┐     │
│ src/app.ts   │  │ Monaco Editor       │     │
│ session-1    │  │ (red/green diff)    │     │
│ session-2    │  │                     │     │
│              │  └─────────────────────┘     │
│ @task items  │                              │
│ @idea items  │  Terminal / Git below        │
│ @bug items   │                              │
└──────────────┴──────────────────────────────┘
```

- **File sidebar**: Lists every file the agent read or wrote. Session history with search, branch, archive.
- **Editor**: Monaco code editor with WYSIWYG and native markdown modes. Red/green diff for change review.
- **Plan mode**: Mermaid diagrams rendered inline. Frontmatter metadata on plan documents.
- **Status tracker**: Workflow items tagged as @task, @idea, @bug, or @decision across documents.
- **Drawing canvas**: Integrated Excalidraw for architecture diagrams.
- **A/B comparison**: Core differentiator — run the same prompt with different agents, compare results side by side.
- **Kanban view**: Manage multiple sessions in kanban columns.
- **One-glance**: The status tracker with tagged items (@task, @bug) provides a quick overview. But it is trying to be both a planning tool and an agent manager, which dilutes focus.

**Praised**: A/B comparison is unique and valuable. WYSIWYG diff review is more approachable than raw diff. Excalidraw integration for visual planning.
**Criticized**: Scope creep — tries to be an editor, planner, kanban board, and agent manager all at once. Electron performance issues. The "everything tool" approach makes it hard to be excellent at any one thing.

---

### 4. Happy Coder (slopus/happy)

**Layout: Mobile-first chat interface with device switching**

```
Mobile:                      Desktop:
┌─────────────────┐         ┌──────────────────────────┐
│ Session: myproj │         │ Terminal (claude)         │
├─────────────────┤         │                          │
│                 │         │ $ claude                 │
│ [agent output]  │         │ > working on feature...  │
│ [agent output]  │         │                          │
│ [permission     │         │ [press any key to        │
│  request]       │         │  take back control]      │
│ [Allow] [Deny]  │         │                          │
│                 │         │                          │
├─────────────────┤         └──────────────────────────┘
│ 🎤 [input box] │
└─────────────────┘
```

- **Mobile view**: Chat-style conversation thread. Permission prompts appear inline with Allow/Deny buttons showing exact operation details. Voice-to-text input. Push notifications for session status, completion, errors, input requests.
- **Desktop**: Normal terminal (happy CLI wraps claude). One keypress switches control to/from mobile.
- **Multi-session**: Can spawn and control multiple Claude Codes in parallel.
- **Agent library**: Autocomplete, command history, agent switching for custom slash commands.
- **One-glance**: Push notifications are the primary "one-glance" mechanism. The mobile chat view shows one session at a time. No dashboard or overview screen described.

**Praised**: The "just works" mobile experience — no SSH tunneling or VNC. Permission handling on mobile is well-designed. E2E encryption (AES-256-GCM). Device switching with one keypress.
**Criticized**: Single-session focus on mobile. No multi-session overview or dashboard view. No diff review capability — you review on desktop with your normal tools.

---

### 5. vde-monitor (yuki-yano)

**Note**: This tool appears to be private or unreleased. yuki-yano's public VDE ecosystem includes vde-layout (terminal multiplexer layout management) and vde-notifier. No public "vde-monitor" repository was found. The existing research file at `.z/research/vde-monitor.md` contains prior findings.

---

### 6. AgentOS (saadnvd1/agent-os)

**Layout: Multi-pane web dashboard with mobile-first design**

```
Desktop (up to 4 panes):
┌───────────┬───────────┐
│ Session 1 │ Session 2 │
│ (terminal)│ (terminal)│
├───────────┼───────────┤
│ Session 3 │ Session 4 │
│ (terminal)│ (terminal)│
└───────────┴───────────┘

Mobile (single pane + nav):
┌─────────────────┐
│ [sessions] [git]│
│                 │
│ Session terminal│
│                 │
│                 │
│ 🎤 [input]     │
└─────────────────┘
```

- **Multi-pane grid**: Up to 4 sessions side-by-side on desktop. Each pane shows a terminal session.
- **Mobile view**: Full functionality, not a degraded responsive view. Voice-to-text input. File upload from mobile.
- **Command palette (⌘K)**: Code search across sessions.
- **Git panel**: Integrated version control with status, diffs, PR management.
- **Dev server controls**: Toggle Node.js and Docker services.
- **File browser**: Direct file attachment and mobile upload support.
- **Remote access**: Via Tailscale VPN (http://100.x.x.x:3011).
- **One-glance**: The 4-pane grid gives simultaneous visibility of 4 sessions. But each pane is a raw terminal — no structured status extraction.

**Praised**: Mobile-first done right — feature parity, not a dumbed-down view. Voice-to-text is genuinely useful for mobile. Self-hosted with no cloud dependency.
**Criticized**: Terminal-only view (no structured data, no diff review). Requires tmux on the backend. Limited to 4 simultaneous panes. Tailscale dependency for remote access.

---

### 7. Vibe Kanban (BloopAI/vibe-kanban)

**Layout: Kanban board + agent workspace with built-in browser**

```
Board View:
┌──────────┬──────────┬──────────┬──────────┐
│ To Do    │ In Prog  │ Review   │ Done     │
│          │          │          │          │
│ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │ ┌──────┐ │
│ │card 1│ │ │card 2│ │ │card 3│ │ │card 4│ │
│ │agent:│ │ │agent:│ │ │      │ │ │      │ │
│ │CC    │ │ │Codex │ │ │[diff]│ │ │[PR]  │ │
│ └──────┘ │ └──────┘ │ └──────┘ │ └──────┘ │
└──────────┴──────────┴──────────┴──────────┘

Workspace View:
┌──────────┬─────────────────┬──────────────┐
│ Issue    │ Terminal         │ Browser      │
│ details  │ (agent running)  │ (app preview)│
│          │                  │              │
│          │                  │ [DevTools]   │
└──────────┴─────────────────┴──────────────┘
```

- **Kanban board**: Classic 4-column layout (To Do / In Progress / Review / Done). Cards show assigned agent, branch, status.
- **Workspace view**: Three-panel with issue details, terminal (agent execution), and built-in browser preview with DevTools, inspect mode, device emulation.
- **Diff review**: Inline diff with commenting capabilities. Review before merge.
- **MCP integration**: The board itself is an MCP server — other agents can create tasks, move cards, read board status programmatically.
- **Agent switching**: 10+ agents supported (Claude Code, Codex, Gemini CLI, Copilot, Amp, Cursor, OpenCode, etc.).
- **One-glance**: The kanban board IS the one-glance view. Column position immediately shows lifecycle stage. Agent assignment is visible on each card.

**Praised**: "Treating agents like asynchronous workers you manage" (not chatbots). Kanban metaphor is immediately understandable. MCP server integration is powerful. Built-in browser preview eliminates context switching.
**Criticized**: Two competing views (board vs. workspace) require mental mode-switching. Board view hides terminal detail. Workspace view loses board context. 9.4k stars but relatively new — stability concerns.

---

### 8. cmux (manaflow-ai/cmux)

**Layout: Native terminal with vertical sidebar + notification rings**

```
┌──────────┬──────────────────────────────┐
│ Tabs     │                              │
│ (sidebar)│  Terminal pane(s)            │
│          │                              │
│ main     │  ┌────────────┬────────────┐ │
│  └ feat  │  │ pane 1     │ pane 2     │ │
│ ○ bugfix │  │ (blue ring │            │ │
│          │  │  = needs   │            │ │
│ ports:   │  │  attention)│            │ │
│ 3000     │  └────────────┴────────────┘ │
│          │                              │
│ PR #42 ✓ │  [optional: in-app browser]  │
│          │                              │
│ ⌘I notif │                              │
└──────────┴──────────────────────────────┘
```

- **Vertical tab sidebar**: Each tab shows git branch, linked PR status/number, working directory, listening ports, latest notification text. The sidebar is a "dynamic status board."
- **Notification rings**: Blue ring around panes when agents need attention. Tabs light up in sidebar. ⌘⇧U jumps to most recent unread.
- **Notification panel (⌘I)**: All pending notifications in one place.
- **Split panes**: ⌘D horizontal, ⌘⇧D vertical. Directional navigation with ⌥⌘ arrows.
- **In-app browser**: Scriptable — agents can snapshot the accessibility tree, click elements, fill forms, evaluate JS.
- **Escape sequence triggers**: Notifications fire automatically via OSC 9/99/777 (standard terminal escape sequences). No agent-specific integration needed.
- **One-glance**: The sidebar metadata (branch, PR, ports, notifications) plus notification rings give excellent at-a-glance status. Best "one-glance" solution in the terminal category.

**Praised**: Native macOS performance (Swift + AppKit, not Electron). Notification rings are immediately understandable. Sidebar metadata density is excellent. Standard escape sequences mean any agent works without integration. Scriptable browser is unique.
**Criticized**: macOS only. No structured data extraction beyond what's in the sidebar. Terminal-based — no diff review or structured conversation view.

---

### 9. Marc Nuri's Dashboard

**Layout: Session cards grouped by device**

```
┌─────────────────────────────────────────────────┐
│ Agent Dashboard                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ MacBook Pro                                     │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│ │ project-a  │ │ project-b  │ │ project-c  │  │
│ │ feat/auth  │ │ main       │ │ fix/bug-42 │  │
│ │ context:78%│ │ context:23%│ │ context:95%│  │
│ │ MCP: 3     │ │ MCP: 1     │ │ MCP: 2     │  │
│ │ ● running  │ │ ○ idle     │ │ ⚠ stale    │  │
│ │ [connect]  │ │ [connect]  │ │ [connect]  │  │
│ └────────────┘ └────────────┘ └────────────┘  │
│                                                 │
│ Workstation                                     │
│ ┌────────────┐ ┌────────────┐                  │
│ │ project-d  │ │ project-e  │                  │
│ │ main       │ │ refactor   │                  │
│ │ context:45%│ │ context:12%│                  │
│ │ ● running  │ │ ● running  │                  │
│ │ [connect]  │ │ [connect]  │                  │
│ └────────────┘ └────────────┘                  │
└─────────────────────────────────────────────────┘
```

- **Session cards**: Each card shows project name, git branch, context usage %, connected MCP servers, current status (running/idle/stale).
- **Grouped by device**: Sessions organized under device headers (MacBook, Workstation, etc.) for cross-machine visibility.
- **Real-time heartbeats**: Agent hooks fire on state transitions (working/idle/awaiting permission). Heartbeat data passes through an enricher chain that extracts/derives specific information.
- **Stale detection**: If an agent stops reporting for too long, the card visually indicates staleness.
- **Remote terminal**: Click "connect" to WebSocket relay into the agent's terminal session directly from the browser. Both human and agent share the same underlying session.
- **One-glance**: This is the best "one-glance" design for multi-device, multi-session monitoring. Every card shows status, project, branch, context. Grouped by device eliminates the "where is this running?" question.

**Praised**: Cross-device visibility solves a real pain point. Enricher pattern is elegant for deriving structured data from raw hooks. Remote terminal access from browser is transformative. Context % indicator is unique and useful.
**Criticized**: No diff review. No task/issue management. Pure monitoring — no orchestration capability. Requires custom hook setup on each machine.

---

### 10. Claude Code Tasks (first-party)

**Layout: Internal task tracking within Claude Code CLI**

```
No visual UI — tasks live in the CLI and ~/.claude/tasks/

$ claude
> /tasks
┌─────┬──────────────────────┬────────────┬───────┐
│ ID  │ Subject              │ Status     │ Owner │
├─────┼──────────────────────┼────────────┼───────┤
│ 1   │ Implement auth       │ in_progress│ main  │
│ 2   │ Write tests          │ pending    │ sub-1 │
│ 3   │ Update docs          │ completed  │ sub-2 │
│ 4   │ Fix CI               │ pending    │       │
│  └── blocked by #1        │            │       │
└─────┴──────────────────────┴────────────┴───────┘
```

- **No visual dashboard**: Tasks are CLI-only. Visible via `/tasks` command or TaskList tool.
- **Task states**: pending / in_progress / completed.
- **Dependency graph**: Tasks can be blocked by other tasks (blockedBy field).
- **Cross-session sharing**: Tasks persist in `~/.claude/tasks/`. Multiple sessions can share a task list via `CLAUDE_CODE_TASK_LIST_ID` environment variable.
- **Sub-agent spawning**: TaskCreate spawns specialized sub-agents that work autonomously and report results back.
- **One-glance**: No one-glance view. You must actively query tasks. This is a coordination primitive, not a monitoring UI.

**Praised**: Native integration — no external tool needed. Sub-agent spawning is powerful. Cross-session task sharing via env vars is simple.
**Criticized**: No visual UI. No real-time monitoring. No status dashboard. The CLI-only interface means you cannot see task progress without actively checking. This is a tool for agents to coordinate, not for humans to monitor.

---

### 11. Amp (Sourcegraph)

**Layout: Thread gallery + in-editor panel**

```
Web (ampcode.com):
┌─────────────────────────────────────────────────┐
│ Thread Gallery                                  │
│                                                 │
│ ┌──────────────────┐ ┌──────────────────┐      │
│ │ React server     │ │ Fix auth flow    │      │
│ │ actions RCE      │ │                  │      │
│ │ @user · 12 prompts│ │ @user · 5 prompts│      │
│ │ 3 files · +142   │ │ 8 files · +89   │      │
│ │ [Oracle] [Lib]   │ │ [Oracle]         │      │
│ │ -23 lines        │ │ -12 lines        │      │
│ └──────────────────┘ └──────────────────┘      │
│                                                 │
│ Thread Map (CLI: threads:map)                   │
│  thread-1 ──→ thread-3 ──→ thread-5            │
│  thread-2 ──↗                                   │
└─────────────────────────────────────────────────┘

VS Code:
┌──────────────────┬──────────────────┐
│ Editor           │ Amp Panel        │
│                  │                  │
│ [code]           │ [thread]         │
│                  │ [conversation]   │
│                  │                  │
└──────────────────┴──────────────────┘
```

- **Thread cards**: Title, creator avatar/username, prompt count, files modified, agent modes used (Oracle, Librarian badges), diff stats (+added/-deleted), tool usage breakdown.
- **Thread Map**: Visual graph showing how threads are linked — which stem from earlier discussions, reference prior work, or continue it. CLI-only for now.
- **Shared threads**: Threads are shared by default. Team can reuse, track adoption, improve together.
- **Sub-agents**: Oracle tool + thread forking for exploring alternative implementations.
- **Cross-device**: CLI + VS Code + JetBrains. Threads persist in the cloud.
- **One-glance**: Thread cards provide good summary of completed work. But no real-time "what is running now" view — threads are historical, not live monitoring.

**Praised**: Thread sharing is excellent for team knowledge. Thread Map visualization for understanding work relationships. Multi-model strategy (use the right model for each subtask). Cross-device thread continuity.
**Criticized**: No real-time monitoring dashboard. Thread-centric view is retrospective, not operational. Cloud-dependent (threads stored on Sourcegraph servers). Pricing concerns for heavy users.

---

### 12. Cursor 2.0

**Layout: Agent-centric IDE with sidebar**

```
┌──────────┬──────────────────────┬──────────────┐
│ Agent    │                      │              │
│ Sidebar  │  Code Editor         │  Agent Chat  │
│          │                      │              │
│ Agent 1  │  [file content]      │  [messages]  │
│  ● active│                      │  [diffs]     │
│ Agent 2  │                      │  [plan]      │
│  ○ done  │                      │              │
│ Agent 3  │  ┌────────────────┐  │              │
│  ◐ plan  │  │ Built-in       │  │              │
│          │  │ Browser        │  │              │
│ [Plans]  │  │ + DevTools     │  │              │
│ plan-1   │  └────────────────┘  │              │
│ plan-2   │                      │              │
└──────────┴──────────────────────┴──────────────┘
```

- **Agent sidebar**: Lists all active agents with status. Toggle between agents. View their output. Agents and plans are first-class objects.
- **Parallel agents**: Up to 8 simultaneously, each in its own git worktree or remote sandbox.
- **Agent specialization**: One for UI, one for backend, one for tests — like a small dev team.
- **Change review**: PR-like view across multiple files (not file-by-file jumping). All agent changes viewable together.
- **Plan Mode**: Create plan with one model, build with another. Foreground or background execution. Parallel plans for comparison.
- **Built-in browser**: Embedded Chrome DevTools, DOM inspection, performance auditing.
- **Context pills**: Files/directories appear as pills inline in the prompt. Agent auto-gathers context.
- **Background agents**: Send work to cloud, UI coming for cloud agent management.
- **One-glance**: The agent sidebar provides a quick overview of all agents and their states. The PR-like review makes change assessment fast.

**Praised**: "50%+ Fortune 500 adoption" suggests the IDE-familiar approach works. Agent sidebar makes agents feel like team members. PR-style review is natural. Parallel plan comparison is powerful.
**Criticized**: IDE paradigm constrains agent management (designed for coding, not orchestration). 8-agent limit is arbitrary. Background agent UI is still immature. Heavy resource usage with multiple agents.

---

## Cross-Cutting Design Patterns

### Information Density Spectrum

From least to most information per screen:

1. **Happy Coder** — Single session chat (mobile-optimized)
2. **Claude Code Tasks** — Text-only task list (CLI)
3. **Superset** — Terminal + workspace sidebar
4. **cmux** — Terminal + rich sidebar metadata + notification rings
5. **AgentOS** — 4-pane terminal grid
6. **Cursor 2.0** — Agent sidebar + editor + chat
7. **Amp** — Thread gallery cards with stats
8. **Devin** — Three-panel with timeline
9. **Marc Nuri** — Session cards with device grouping
10. **Nimbalyst** — Editor + plan + canvas + sessions
11. **Vibe Kanban** — Kanban board + workspace + browser

### The "One Glance" Problem: Who Solves It Best?

| Approach | Tools | Effectiveness |
|---|---|---|
| **Session cards grouped by device** | Marc Nuri | BEST for cross-device monitoring. Every card shows project, branch, status, context %. |
| **Kanban columns** | Vibe Kanban, Nimbalyst | GOOD for lifecycle tracking. Column position = stage. But hides real-time detail. |
| **Sidebar with metadata** | cmux | GOOD for terminal users. Branch, PR, ports, notification text in sidebar. Notification rings draw attention. |
| **Workspace list + status indicators** | Superset, Cursor 2.0 | MODERATE. Quick agent state overview but minimal per-session detail. |
| **Multi-pane grid** | AgentOS | MODERATE. See 4 terminals at once but raw output only. |
| **Session list with previews** | Devin | WEAK for overview. Inline PR previews help but still single-session-focused. |
| **Thread gallery** | Amp | WEAK for real-time. Good for retrospective review, not live monitoring. |
| **Push notifications** | Happy Coder | REACTIVE only. Good for mobile alerts but no dashboard view. |

### Navigation Patterns

| Pattern | Used By | Notes |
|---|---|---|
| **Sidebar + main content** | Devin, Cursor, Superset, cmux, Nimbalyst | Universal pattern. Works everywhere. |
| **Keyboard shortcuts (⌘1-9)** | Superset, cmux | Power-user efficient. Requires memorization. |
| **Command palette (⌘K)** | AgentOS | Familiar from VS Code. Good for discoverability. |
| **Card grid → detail drill-down** | Marc Nuri, Amp | Good for overview-first navigation. |
| **Kanban columns → workspace** | Vibe Kanban | Two-mode navigation (board vs. workspace). |
| **Device switching** | Happy Coder | One keypress to move control between devices. |
| **Tab bar** | cmux (vertical), Superset | Persistent session access. |

### Mobile Support

| Tool | Mobile Support | Quality |
|---|---|---|
| Happy Coder | Native iOS/Android + PWA | EXCELLENT — first-class, feature parity |
| AgentOS | Mobile-first web | GOOD — voice input, file upload from phone |
| Marc Nuri | Web dashboard (responsive) | GOOD — cards work well on mobile |
| Vibe Kanban | Web (responsive) | MODERATE — board works, workspace does not |
| Amp | Web threads | MODERATE — read-only thread viewing |
| Devin | Web app | MODERATE — usable but desktop-optimized |
| Superset | None | desktop-only (Electron) |
| cmux | None | macOS-only native app |
| Cursor | None | desktop IDE only |
| Nimbalyst | None | desktop-only (Electron) |

---

## Poorly-Regarded Features / Pain Points

### 1. Terminal-only views without structured data
Tools that show only raw terminal output (Superset, AgentOS, cmux) force users to visually parse terminal text for status. Users want structured status indicators, not raw PTY output.

### 2. Single-session focus
Devin, Happy Coder, and Claude Code Tasks focus on one session at a time. For multi-agent workflows, users need a dashboard view, not a drill-down-only design.

### 3. Two-mode navigation friction
Vibe Kanban and Nimbalyst have competing views (board vs. workspace, plan vs. editor) that require mental mode-switching. Users report losing context when switching modes.

### 4. Lack of diff review
Pure monitoring tools (Marc Nuri, cmux, Happy Coder) have no built-in diff review. Users must switch to their editor to review changes, breaking flow.

### 5. No cross-device visibility
Most desktop tools (Superset, cmux, Cursor, Nimbalyst) have zero cross-device awareness. Marc Nuri's dashboard and Happy Coder are the only tools that explicitly solve this.

---

## User Feedback Summary

### Hacker News / Product Hunt

- Superset: "This agent-first approach is really cool. Feel like I have pushed the traditional IDE workflows to their max" — praised for breaking from the IDE paradigm.
- cmux: Notification rings and sidebar metadata density were the most praised UI elements.
- AgentOS: Creator's pitch "tired of juggling terminal windows" resonated. Feature requests focused on multi-agent comparison, not UI complaints.
- Vibe Kanban: The kanban metaphor for agent management was immediately understood by developers. "Treating agents like asynchronous workers" was a repeated positive.

### Blog Posts

- Marc Nuri: "The feature that changed everything was the ability to connect to any agent session directly from the browser." Remote terminal access was the killer feature.
- Ry Walker (Mac app comparison): Hybrid models work best — "preserving the IDE experience while adding agent features succeeds at scale" (Cursor's approach). But "agent-agnostic abstraction" (Emdash/Superset) is emerging as a viable alternative.

---

## Learnings for banto

### What Users Actually Want
- A single screen that answers "what are all my agents doing right now?" across devices and projects
- Session cards with structured data (project, branch, status, context usage, PR link) — not raw terminal output
- Notification when attention is needed, with the ability to jump directly to that session
- Diff review without leaving the dashboard
- Mobile access with feature parity, not a degraded view

### Technical Design Lessons
- Marc Nuri's enricher pattern (raw hook data → chain of enrichers → structured card data) is the right architecture for extracting status from diverse agents
- Heartbeat/hook-based status is more reliable than polling or PTY scraping
- WebSocket relay for remote terminal access is the proven pattern (Marc Nuri, Happy Coder both use it)
- Cross-session task sharing (Claude Code Tasks' env var approach) is simple but effective

### UX Pattern Lessons
- **Session cards grouped by project** (not device) is the right default for banto's "one view" principle — banto's user has one device, not multiple
- **Kanban columns** for task lifecycle (not just agent status) match banto's "jot, throw, watch" flow: Backlog → Running → Review → Done
- **Notification rings** (cmux) or **status badges** (Superset) are the right visual weight for "needs attention" — not full push notifications
- **Context %** indicator (Marc Nuri) is valuable and unique — shows when a session is approaching limits
- **Timeline scrubber** (Devin) is useful for understanding what happened, but real-time status matters more for banto's monitoring use case
- **Two-mode designs fail** — avoid separate "board view" and "workspace view." Instead, use expandable cards or drill-down within a single layout

### Business & Ecosystem Lessons
- The market is converging on two camps: terminal-enhancers (cmux, Superset) vs. web dashboards (Vibe Kanban, AgentOS, Marc Nuri). banto is in the web dashboard camp.
- Agent-agnostic support (not locked to one agent) is table stakes — every successful tool supports multiple agents
- Mobile access is a differentiator, not a nice-to-have. Happy Coder and AgentOS both found strong demand for mobile monitoring
- MCP integration (Vibe Kanban as MCP server) turns the dashboard into a coordination primitive that agents themselves can use

---

## Sources

- https://ppaolo.substack.com/p/in-depth-product-analysis-devin-cognition-labs — Devin UI deep analysis with three-panel layout description
- https://docs.devin.ai/release-notes/overview — Devin session list redesign details (Feb 2026)
- https://cognition.ai/blog/devin-2 — Devin 2.0 interactive planning
- https://github.com/superset-sh/superset — Superset README, keyboard shortcuts, workspace management
- https://news.ycombinator.com/item?id=46109015 — Superset HN discussion
- https://nimbalyst.com/crystal — Nimbalyst features page with UI descriptions
- https://github.com/slopus/happy — Happy Coder README
- https://happy.engineering/docs/features/ — Happy Coder features documentation
- https://github.com/saadnvd1/agent-os — AgentOS README
- https://news.ycombinator.com/item?id=46533405 — AgentOS HN discussion
- https://github.com/BloopAI/vibe-kanban — Vibe Kanban README with board/workspace screenshots
- https://vibekanban.com/ — Vibe Kanban official site
- https://github.com/manaflow-ai/cmux — cmux README with sidebar and notification details
- https://www.cmux.dev/ — cmux official site
- https://blog.marcnuri.com/ai-coding-agent-dashboard — Marc Nuri's dashboard blog post with enricher pattern
- https://medium.com/@joe.njenga/claude-code-tasks-are-here — Claude Code Tasks feature analysis
- https://deliberate.codes/til/2026/claude-code-task-tools/ — Claude Code task management tools
- https://ampcode.com/ — Amp landing page with thread gallery
- https://ainativedev.io/news/amp-launches-thread-map-to-help-navigate-ai-coding-agent-work — Amp Thread Map feature
- https://cursor.com/changelog/2-0 — Cursor 2.0 changelog
- https://inkeep.com/blog/cursor-2-review — Cursor 2.0 review with agent sidebar analysis
- https://rywalker.com/research/mac-coding-agent-apps — Mac coding agent app comparison
- https://www.smashingmagazine.com/2026/02/designing-agentic-ai-practical-ux-patterns/ — Agentic AI UX design patterns
