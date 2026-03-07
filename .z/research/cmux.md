# cmux (manaflow-ai/cmux) Research

Date: 2026-03-07
Sources:
- https://github.com/manaflow-ai/cmux

cmux is a well-executed native macOS terminal multiplexer built specifically for the AI agent workflow. Its core insight — **notification rings that show which agent needs attention** — is the feature that distinguishes it from Ghostty/iTerm2/tmux. The vertical sidebar with rich metadata (git branch, PR status, ports, notification text) provides at-a-glance awareness across many parallel agent sessions. cmux's weakness is that it's just a terminal — it has no task management, no agent orchestration, no review UI, and no cross-device access. These are exactly banto's differentiators: cmux is the execution surface, banto is the management layer.

---

## Overview

- **Repository:** https://github.com/manaflow-ai/cmux
- **License:** AGPL-3.0-or-later
- **Stars:** 4,363 (as of 2026-03-06)
- **Language:** Swift
- **Created:** 2026-01-28
- **Author:** Lawrence Chen (@lawrencecchen)
- **Release pace:** 61 releases in ~5 weeks (v0.00 to v0.61.0, 2026-01-28 to 2026-02-25)

---

## Architecture

### Tech Stack

- **Swift / AppKit** native macOS app (not Electron/Tauri)
- **libghostty** (Ghostty's terminal rendering library) for GPU-accelerated terminal rendering
- **Bonsplit** — custom split-pane/tab management framework (in-tree as `vendor/bonsplit/`)
- **WKWebView** — embedded browser via WebKit
- **Zig** — used to build GhosttyKit.xcframework from the Ghostty fork
- **SwiftTerm** — listed as a dependency in `Package.swift`
- **Sparkle** — auto-update framework
- **PostHog** — analytics (DAU signal)
- **Sentry** — error tracking for both app and CLI

### Hierarchy: Window > Workspace > Surface/Pane

cmux organizes terminal sessions in a three-level hierarchy:

1. **Window** — top-level macOS window. Multiple windows supported via Cmd+Shift+N.
2. **Workspace** — equivalent to a "tab" in traditional terminals. Shown in the vertical sidebar. Each workspace maps to one project/task. Workspaces can be pinned, colored, renamed, and reordered via drag-and-drop.
3. **Surface (Tab)** within a **Pane** — inside each workspace, split panes contain tabs (called "surfaces"). Panes can be split horizontally (Cmd+Shift+D) or vertically (Cmd+D). Each pane can hold multiple surfaces (terminal, browser, or markdown panels).

Panel types:
- `TerminalPanel` — Ghostty-powered terminal
- `BrowserPanel` — WKWebView with scriptable API
- `MarkdownPanel` — rendered markdown view

### Socket API & CLI

cmux communicates through a Unix domain socket (`/tmp/cmux.sock` for production). The CLI binary (`cmux`) sends JSON commands over this socket.

**Two API versions coexist:**
- **v1** — flat command names like `focus_window`, `select_workspace`, `send_key`
- **v2** — namespaced JSON-RPC style like `window.list`, `workspace.select`, `surface.focus`

Both use handle-based references (short refs like `surface:1`, `pane:2`) instead of raw UUIDs for agent ergonomics.

**Socket access control** has five modes:
1. `off` — socket disabled
2. `cmuxOnly` (default) — only processes started inside cmux terminals
3. `automation` — any local process from same macOS user
4. `password` — requires file-based password auth
5. `allowAll` — no restrictions

**Environment variables** set in child shells:
- `CMUX_SOCKET_PATH` — socket location
- `CMUX_WORKSPACE_ID` — UUID of the current workspace
- `CMUX_PANEL_ID` / `CMUX_SURFACE_ID` — current panel/surface UUID
- `CMUX_TAG` — debug build tag for isolation

### Layout Persistence on Relaunch

On quit, cmux snapshots:
- Window/workspace/pane layout (split tree structure with divider positions)
- Working directories per panel
- Terminal scrollback (best effort, truncated)
- Browser URL and navigation history (back/forward)
- Sidebar metadata (status entries, git branch, progress, log entries)
- Panel custom titles, colors, pinned state

On relaunch, this is all restored. However, **live process state is NOT restored** — active Claude Code sessions, vim, tmux, etc. are not resumed.

### Ghostty Integration

cmux uses a **fork** of Ghostty (`manaflow-ai/ghostty`) compiled as `GhosttyKit.xcframework`. The fork is maintained to add cmux-specific features while staying close to upstream.

cmux reads the user's existing `~/.config/ghostty/config` for themes, fonts, and colors, providing compatibility with existing Ghostty setups.

### Build System

- Xcode project (`GhosttyTabs.xcodeproj`)
- Zig for building GhosttyKit (Release optimization)
- `scripts/setup.sh` for initial setup (submodules + xcframework)
- `scripts/reload.sh --tag <name>` for isolated debug builds
- Tagged builds get their own bundle ID, socket path, and derived data — multiple debug instances can run simultaneously

### Notification Ring System

#### What Triggers a Notification Ring

Notifications are triggered by two mechanisms:

1. **OSC escape sequences** — terminal programs emit OSC 9, OSC 99, or OSC 777 (see OSC Escape Sequences subsection)
2. **CLI command** — `cmux notify --title "..." --body "..."`
3. **Claude-hook integration** — `cmux claude-hook notification` / `cmux claude-hook stop` / `cmux claude-hook session-start`, which internally call the notification system

When `TerminalNotificationStore.addNotification()` receives a notification:
- If the pane IS currently focused AND the app is focused: the notification is **silently dropped** (not stored). This is a known pain point — see issue #963.
- Otherwise: the notification is stored, the macOS desktop notification is scheduled, a sound plays, and the workspace gets moved to the top of the sidebar (if auto-reorder is enabled).

#### How Is It Displayed

The notification ring manifests in multiple places simultaneously:

1. **Pane border ring** — the terminal pane gets a blue glowing border (`notificationRingLayer.strokeColor` in `GhosttyTerminalView.swift`). The color is currently hardcoded to `NSColor.systemBlue`. Issue #557 requests per-notification custom colors via `--color`.

2. **Bonsplit tab badge** — within a pane's tab bar, unread tabs show a blue dot indicator. This only renders when the tab is `!isSelected && !isHovered`.

3. **Sidebar workspace row** — the workspace entry in the sidebar shows the latest notification text. Workspaces with unread notifications are auto-reordered to the top (configurable, default on).

4. **macOS desktop notification** — standard `UNUserNotificationCenter` notification with configurable sound (17 system sounds + custom file + none). Custom shell commands can also be triggered.

5. **Dock badge** — unread count appears on the app icon in the Dock (configurable).

6. **Menu bar extra** — a status bar icon with unread badge count and quick actions (show, jump to unread, mark all read, clear all).

7. **Notifications panel** — accessible via Cmd+I, shows all notifications in a scrollable list with title, body, timestamp, tab name, and read/unread status.

#### How the User Interacts

- **Cmd+Shift+U** — jump to the latest unread notification (focuses the correct workspace and surface)
- **Cmd+I** — open the notifications panel in the sidebar
- Click a notification row to navigate to that workspace/surface
- Right-click workspace > "Mark Tab as Unread" to manually flag
- "Clear All" button in notifications panel
- Notifications auto-mark-as-read when the user focuses the relevant workspace/surface

#### Notification Suppression Behavior

When the user is already focused on the workspace that generates a notification:
- macOS popup/sound: suppressed (good)
- Notification storage: **also suppressed** (bad — issue #963)
- This means if you're watching an agent work and it transitions to "needs input," you get no signal at all

Issue #1004 reports desktop notifications not being suppressed when the window IS focused — the inverse problem.

**Takeaway:** Always store notifications even when the user is viewing the relevant pane. Suppress popup/sound, but keep state — otherwise transient signals are silently lost.

### OSC Escape Sequences

#### Supported OSC Codes

cmux picks up three standard terminal notification sequences:

| OSC Code | Origin | Format |
|----------|--------|--------|
| OSC 9 | iTerm2 | `\e]9;message\a` — simple notification body |
| OSC 99 | kitty | `\e]99;i=id:d=0;title\a` + `\e]99;i=id:d=1;body\a` — structured with id, title, body |
| OSC 777 | rxvt-unicode | `\e]777;notify;title;body\a` — semicolon-delimited |

These are the same sequences that terminal multiplexers and terminal apps have standardized on. Ghostty already parses these at the VT level; cmux hooks into Ghostty's callback mechanism to capture them.

#### How Agents Emit These Sequences

Most agents do NOT directly emit OSC sequences. Instead, cmux provides integration paths:

**Claude Code** uses hooks in `~/.claude/settings.json`:
```json
{
  "hooks": {
    "Notification": [{
      "hooks": [{
        "type": "command",
        "command": "cmux claude-hook notification 2>/dev/null || true"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "cmux claude-hook stop 2>/dev/null || true"
      }]
    }]
  }
}
```

The `cmux claude-hook` subcommand maintains a session store (`~/.cmuxterm/claude-hook-sessions.json`) that maps Claude Code session IDs to workspace/surface UUIDs, enabling notifications to target the correct pane even with multiple parallel sessions.

**OpenAI Codex** uses its `notify` config to call `cmux notify`.

**OpenCode** uses a plugin that calls `cmux notify` on events.

**Agents without OSC support** — Issues #894 (Qwen Code), #896 (OpenCode CLI), #898 (Kimi CLI), #899 (Cline CLI) all report that these tools don't emit OSC notifications natively. Users must wire up custom hooks or shell integrations.

#### What Information Is Communicated

Via the `cmux notify` CLI or `claude-hook`:
- `--title` — primary notification heading (e.g., "Claude Code")
- `--subtitle` — secondary line (e.g., "Permission")
- `--body` — detail text (e.g., "Approval needed")
- `--tab` / `--panel` — target specific workspace/surface by index or UUID

Via socket commands (`report_status`, `set-status`):
- Status text, icon, color for sidebar display
- Progress value + label
- Git branch + dirty state
- Listening ports
- Log entries with level/source
- Pull request number, label, URL, status

**Takeaway:** Own the agent execution layer so you can emit structured events directly — retrofitting notification hooks onto third-party CLIs is a losing game (see cmux issues #894, #896, #898, #899).

### Sidebar Metadata

#### What Metadata Is Shown

Each workspace row in the vertical sidebar displays:

1. **Title** — process title or custom name (editable via Cmd+Shift+R or right-click)
2. **Git branch** — current branch name with dirty indicator. Detected via shell integration or socket `report_git_branch` command.
3. **Working directory** — current `pwd`, shown when different from default
4. **Listening ports** — TCP ports opened by processes in the workspace's TTY (e.g., `3000`, `8080`)
5. **Latest notification text** — most recent notification title/body for that workspace
6. **PR status** — linked pull request number, label, and status (open/merged/closed) with clickable URL
7. **Notification badge** — blue dot for unread notifications
8. **Custom color** — workspace-specific color indicator on the left rail

#### How Is It Collected

**Git branch:** Collected via two mechanisms:
- Shell integration (Ghostty's shell integration hooks)
- Socket command `report_git_branch` from agents
- Known issues: branch doesn't update when agent checks out a new branch (#666), stops updating after sleep/wake (#494, #582, fixed), sometimes fails to show (#951)

**Listening ports:** The `PortScanner` class runs a batched scan:
1. Shells report their TTY via socket `report_tty` command
2. `ports_kick` triggers a scan cycle
3. Scanner runs `ps -t <ttys>` to find PIDs, then `lsof -nP -p <pids> -iTCP -sTCP:LISTEN` to find ports
4. Scans are coalesced (200ms debounce) and burst-scanned (6 scans over 10 seconds after a kick)
5. Results delivered per-panel via callback

**PR status:** Set via `set-pull-request` socket command with number, label, URL, and status.

**Status entries:** Arbitrary key-value pairs set via `set-status` socket command. Support icon (SF Symbol name), color (hex), URL, priority, and markdown format.

**Progress:** Set via `set-progress` socket command with value (0.0-1.0) and optional label.

#### Sidebar Layout Options

- Vertical layout: branch and directory shown on separate lines per workspace
- Configurable sidebar width
- Auto-reorder on notification (toggleable)
- New workspace placement: top, after current, or end

#### Data Model

The `Workspace` class holds:
```swift
var statusEntries: [String: SidebarStatusEntry]  // key-value status
var logEntries: [SidebarLogEntry]                 // log messages
var progress: SidebarProgressState?               // progress bar
var gitBranch: SidebarGitBranchState?             // branch + dirty
var pullRequest: SidebarPullRequestState?         // PR metadata
var surfaceListeningPorts: [UUID: [Int]]          // ports per panel
```

All sidebar metadata is persisted across session restores.

**Takeaway:** Surface every piece of context (branch, ports, PR, status) directly in the list view — forcing users to click into a detail view to get basic state awareness defeats the "glanceable" property.

### "Primitive, Not a Solution" Philosophy

#### Core Principles

From the README and "Zen of cmux" blog post:

1. **cmux is not prescriptive** — it doesn't impose a workflow for using coding agents
2. **Composable primitives** — terminal, browser, notifications, workspaces, splits, tabs, CLI
3. **Developer agency** — "What you build with the primitives is yours"
4. **Emergent workflows** — "Give a million developers composable primitives and they'll collectively find the most efficient workflows faster than any product team could design top-down"
5. **Terminal-first** — the author prefers terminals over GUI orchestrators because "GUI orchestrators lock you into their workflow"

#### Design Decisions from This Philosophy

- **No built-in agent orchestration** — cmux doesn't start/stop agents, manage queues, or assign tasks. It's a terminal.
- **CLI/socket API for everything** — all features are scriptable so developers can compose their own workflows
- **Ghostty config compatibility** — reads existing config rather than forcing a new configuration system
- **Multiple panel types** — terminal, browser, markdown. Not just terminal.
- **Environment variables over magic** — `CMUX_WORKSPACE_ID`, `CMUX_SOCKET_PATH` etc. let agents self-discover their context

#### Practical Implications

The "primitive" philosophy means cmux avoids features like:
- Task management / assignment
- Agent status dashboards (beyond sidebar metadata)
- Diff review panels (requested in #609 but not built)
- Approval UIs for agent actions (#740 — "Approval requests exist but no visible approval UI")
- Loading indicators when agents are working (#149 — open feature request)

**Takeaway:** "Primitive not solution" works for a terminal multiplexer, but banto IS the solution layer — embrace opinionated task/agent lifecycle management while keeping the underlying APIs scriptable.

---

## Well-Regarded Features

### Notification Rings (Most Distinctive Feature)
The notification ring system is cmux's signature feature. Issue #469 ("What's your favorite cmux feature?") lists it as a top option. The ability to see at a glance which agent needs attention across splits and tabs is the primary value proposition.

### Vertical Sidebar with Rich Metadata
Git branch, PR status, ports, notification text — all visible per workspace without switching tabs. Multiple users in #469 express interest in expanding this further ("Is that possible to convert sidebar into a dashboard?").

### Scriptable CLI & Socket API
The CLI enables deep automation. The `cmux notify`, `cmux send`, `cmux claude-hook` commands allow developers to wire any agent tool into cmux's notification system. The v2 JSON-RPC API with handle-based refs makes agent automation ergonomic.

### In-App Browser with Scriptable API
Ported from `vercel-labs/agent-browser`. Agents can snapshot the accessibility tree, get element refs, click, fill forms, and evaluate JS. Unique differentiator for agent-browser interaction workflows.

### Native Performance
Built with Swift/AppKit + libghostty, not Electron. The README explicitly positions this against "Electron/Tauri apps" where "the performance bugged me." Fast startup, low memory.

### Ghostty Compatibility
Reads existing `~/.config/ghostty/config`. Users don't need to reconfigure themes, fonts, or colors.

### Session Restore
Layout, working directories, scrollback, browser history all persist across relaunches. Important for the "many agents running" workflow.

### Rapid Development Pace
61 releases in ~5 weeks (v0.00 to v0.61.0, 2026-01-28 to 2026-02-25). The changelog is dense with fixes and features. Active maintainer response in issues.

---

## Poorly-Regarded Features / Pain Points

### Notification Suppression When Focused (#963)
When viewing a workspace that generates a notification, the notification is silently dropped entirely — not stored, no ring, no sound. This breaks multi-agent workflows where you watch an agent and it transitions to "needs input."

### Terminal Goes Blank on Notification (#914, #683)
Multiple reports of terminal panes going blank/black when notifications fire, especially on new tabs. Video evidence provided in #914.

### macOS-Only
No Linux or Windows support. Issue #1012 requests Windows. The Swift/AppKit/libghostty stack makes cross-platform very difficult.

### No Native OSC Support in Many Agents
Issues #894, #896, #898, #899 — Qwen Code, OpenCode CLI, Kimi CLI, Cline CLI don't emit OSC notifications. Users must manually configure shell hooks for each tool.

### Browser Pane Issues
Multiple open issues: blank pages after rearranging (#968), blank during drag (#949), OAuth redirect failures (#957), focus problems (#983), pane unfocusable after menu dismiss (#983).

### Sidebar Git Branch Staleness
Branch name doesn't update when agent checks out a new branch (#666), sometimes fails to show at all (#951), and has had recurring sleep/wake regressions.

### Socket Reliability
CLI socket connection was flaky (#952, fixed). `set-hook` fails with ENOENT when sandbox blocks shell execution (#996). Claude-hook can target wrong workspace in multi-session use (#695).

### Missing Workspace Hierarchy
Multiple users in #469 request a Workspace > Tab hierarchy (like i3). Currently workspaces are flat with surfaces inside panes, but there's no sub-workspace grouping. Called a "showstopper" by at least one user.

### No Tab Folders / Grouped Tabs (#997)
Requested but not implemented. With many parallel agent sessions, workspace organization becomes difficult.

### Split Doesn't Inherit Working Directory (#903)
Cmd+D / Cmd+Shift+D creates a split but doesn't inherit the current working directory from the source pane.

### Light Mode Issues (#924)
Light mode was added but has contrast problems — menu text becomes invisible against the light background.

### Scroll Position Lost on Tab Switch (#945)
Switching between tabs loses scroll position, making it hard to review long agent output.

### Top Issues by Reaction Count

| Reactions | Issue # | Title | Theme |
|-----------|---------|-------|-------|
| 29 | #469 | What's your favorite cmux feature? | Community / Meta |
| 19 | #330 | Linux support? | Platform |
| 11 | #135 | Customizable keybindings / respect Ghostty hotkey config | Keybindings |
| 11 | #293 | Intel (x86_64) Mac support | Platform |
| 10 | #123 | Native support for Claude Code agent teams — open teammates in split panes | Agent Workflow |
| 10 | #719 | Open in browser | Browser Integration |
| 7 | #480 | Persistence of tab information and pane layouts | Session Restore |
| 6 | #373 | Enable cmux CLI commands from within SSH remote sessions | Remote / SSH |
| 6 | #263 | ghostty transparency not supported | Theming |
| 6 | #569 | Splits inside surfaces | Layout |
| 6 | #750 | cmux shutdowns when move mouse pointer at sidebar top button group | Crash / Stability |
| 6 | #879 | background-opacity not applied to terminal rendering area | Theming |
| 5 | #136 | Zoom / auto-resize focused pane in splits | Layout |
| 5 | #351 | Fullscreen/zoom window and tmux-style pane maximize toggle | Layout |
| 5 | #559 | better ssh integration | Remote / SSH |

---

## User Feedback Summary

The most-loved feature is the notification ring system (issue #469), which provides instant visual signal for which agent needs attention. Users also value the rich sidebar metadata and the scriptable CLI/socket API. Multiple users in #469 expressed desire to expand the sidebar into a full dashboard.

Key frustrations center around platform limitations (macOS-only, no Linux — #330 with 19 reactions), notification reliability (suppression when focused #963, blank terminals on notification #914), and organizational scalability (no workspace hierarchy, no tab folders #997). The lack of native OSC support across agents (#894, #896, #898, #899) forces manual hook configuration for each tool. Browser pane stability is a recurring complaint with multiple open issues.

The community strongly requests customizable keybindings (#135, 11 reactions), Intel Mac support (#293, 11 reactions), and agent team workflows (#123, 10 reactions). SSH/remote support (#373, #559) is also a common ask.

---

## Learnings for banto

### What Users Actually Want

1. **At-a-glance agent status** — cmux's notification ring is the most-loved feature because it answers "which agent needs me?" without reading text. banto should provide equivalent visual signals on task cards (animated borders, color-coded status indicators).
2. **Rich metadata without drilling down** — users want git branch, PR status, ports, and latest message visible directly in the list view. Forcing click-through to detail views defeats "glanceability."
3. **Workspace/task organization at scale** — multiple users call the lack of hierarchy a "showstopper." banto's project-based task grouping already addresses this, but should support pinning, custom ordering, and filtering.
4. **Cross-platform access** — macOS-only is cmux's biggest structural limitation (19 reactions on #330). banto's PWA approach inherently solves this.
5. **Agent lifecycle management** — cmux explicitly avoids task management, agent orchestration, and review/approval UIs. These gaps are exactly banto's value proposition (jot-throw-watch cycle, session history in SQLite, structured diffs).

### Technical Design Lessons

1. **Always store notifications** — cmux #963 shows that suppressing notification storage when the user is viewing the relevant pane causes silent data loss. Suppress popup/sound for active items, but always persist state.
2. **Own the agent execution layer** — retrofitting notification hooks onto third-party CLIs is a losing game (cmux issues #894, #896, #898, #899). banto controls agent execution directly, so it can emit structured events natively.
3. **Structured events over text** — cmux's OSC sequences carry flat text. banto's WebSocket events carry typed JSON (`session.status_change`, `session.notification`, `session.progress`, `session.git_branch_change`, `session.port_listening`), which is strictly more powerful.
4. **Session persistence** — cmux saves layout, working directories, scrollback, browser history, and sidebar metadata across relaunches. banto should persist all meaningful session state server-side in SQLite.
5. **API-first design** — cmux's CLI/socket API makes everything scriptable. banto should expose Elysia REST + WebSocket APIs so power users can automate via `banto start --project foo --task "implement feature X"`.

### UX Pattern Lessons

| cmux Feature | banto Adaptation |
|---|---|
| Blue ring on panes needing attention | Animated border/glow on task cards + notification badge |
| Cmd+Shift+U jump to latest unread | Keyboard shortcut or floating button to jump to highest-priority pending item |
| Sidebar auto-reorder by activity | Task list auto-sort: "needs attention" pinned to top |
| Workspace-scoped environment vars | Session-scoped context: each agent session knows its task ID, project |
| `cmux notify` fallback to `osascript` | Graceful degradation: WebSocket -> SSE -> polling |
| Per-workspace port scanning | Per-session port display (dev server URLs clickable in dashboard) |
| Session restore on relaunch | Browser tab restore + server-side session state persistence |
| Notification sound customization | Browser Notification API with user-selected sounds |

Web-specific notification translations:
- **Card border glow / pulse animation** on task cards when an agent needs attention. CSS `box-shadow` with `animation` can replicate the blue ring effect.
- **Favicon badge** using canvas-drawn favicon with notification count (dynamic `<link rel="icon">`).
- **Browser Notification API** (`new Notification()`) for desktop-level alerts when the tab is not focused.
- **WebSocket push** — server sends notification events; client updates UI immediately without polling.
- **Sound** — `Audio()` API for notification sounds, with user preference for which sound or mute.
- **Priority/urgency levels** — cmux treats all notifications equally. banto could differentiate: permission request (critical) vs. task complete (informational) vs. progress update (ambient).

### Business & Ecosystem Lessons

1. **"Primitive, Not a Solution" has limits** — cmux's philosophy works for a terminal multiplexer, but users in #469 already ask "Is that possible to convert sidebar into a dashboard?" and request approval UIs (#740), diff review (#609), and loading indicators (#149). The demand for the solution layer exists.
2. **Rapid iteration builds trust** — 61 releases in ~5 weeks with active issue response creates strong community engagement. banto should prioritize shipping incremental improvements over big-bang releases.
3. **Don't over-prescribe agent interaction** — let users configure how they want to work with agents rather than forcing a specific flow. Keep the underlying APIs scriptable even while providing opinionated defaults.
4. **Config compatibility reduces friction** — cmux reads existing Ghostty config, so users don't need to reconfigure. banto should integrate with existing tool configs (Claude settings, project configs) rather than requiring separate configuration.

---

## Sources

- https://github.com/manaflow-ai/cmux
