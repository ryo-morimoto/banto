# AgentOS (saadnvd1/agent-os) Research

Date: 2026-03-07
Sources:
- https://github.com/saadnvd1/agent-os
- https://news.ycombinator.com/item?id=42641874

Mobile-first web UI for managing AI coding sessions (Claude Code, Codex, Aider, Gemini CLI, Amp, Pi). Self-hosted with multi-pane terminals, git integration, and session orchestration. 75 stars, MIT license.

---

## Overview

AgentOS is a self-hosted Next.js application that provides a mobile-first web interface for managing multiple AI coding agent sessions. Created by Saad Naveed (saadnvd1), it was open-sourced in January 2026 and announced via Show HN. The core insight is that developers want to manage coding agents from their phone -- not a dumbed-down responsive view, but a purpose-built mobile-first interface.

The project also offers:
- **Tauri desktop app** -- native window wrapper (macOS Apple Silicon, Linux .deb/.AppImage)
- **AgentOS Cloud** -- pre-configured cloud VMs (commercial offering)

Supported agents: Claude Code (with session resume + branch fork), Codex, Aider, Gemini CLI, OpenCode, Amp, Cursor CLI, Pi. Only Claude Code supports session resume and branch forking.

---

## Architecture

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React 19, Radix UI, Tailwind CSS |
| Editor | CodeMirror + Monaco Editor |
| Terminal | xterm.js with addons |
| Database | better-sqlite3 |
| Data fetching | TanStack React Query |
| Real-time | WebSockets |
| Desktop | Tauri (Rust shell) |
| MCP | @modelcontextprotocol/sdk |
| Language | TypeScript (94.4%), Shell (3.2%), CSS (2.1%) |

### Repository Structure

```
agent-os/
├── app/                  # Next.js app router pages
├── components/           # React UI components
├── contexts/             # React context providers
├── data/                 # Static data / fixtures
├── hooks/                # Custom React hooks
├── lib/                  # Core business logic
│   ├── claude/           # Claude Code-specific integration
│   ├── client/           # Client-side utilities
│   ├── db/               # SQLite schema & queries
│   ├── providers/        # Agent provider abstractions
│   ├── orchestration.ts  # Conductor/worker MCP logic
│   ├── panes.ts          # tmux pane management
│   ├── worktrees.ts      # Git worktree operations
│   ├── git.ts            # Core git operations
│   ├── git-status.ts     # Git status parsing
│   ├── git-history.ts    # Git log/history
│   ├── multi-repo-git.ts # Multi-repository support
│   ├── pr-generation.ts  # PR creation helpers
│   ├── code-search.ts    # ripgrep integration
│   ├── notifications.ts  # Notification utilities
│   ├── status-detector.ts # Agent status detection
│   ├── file-upload.ts    # File upload handling
│   └── ...               # ~15 more utility modules
├── mcp/                  # MCP server/tool definitions
├── stores/               # Client-side state stores
├── styles/               # Global CSS / Tailwind
├── scripts/              # CLI entry points (agent-os run/start/stop)
├── src-tauri/            # Tauri desktop wrapper (Rust)
├── server.ts             # WebSocket + Next.js custom server
├── package.json
└── next.config.ts
```

### Key Dependencies

| Category | Package | Version |
|---|---|---|
| Framework | next | 16.1.1 |
| UI | react | 19.2.1 |
| Terminal | xterm.js | 6.0.0+ |
| PTY | node-pty | 1.2.0-beta.6 |
| WebSocket | ws | 8.19.0 |
| Database | better-sqlite3 | — |
| MCP | @modelcontextprotocol/sdk | 1.25.2 |
| Editor | monaco-editor | 0.55.1 |
| Data fetching | @tanstack/react-query | 5.90.16 |
| UI primitives | @radix-ui/* | various |
| Styling | tailwindcss | 4.1.18 |

### WebSocket Terminal Architecture (server.ts)

The custom server intercepts HTTP upgrade requests and routes `/ws/terminal` connections to a dedicated WebSocket server, separate from Next.js HMR traffic:

1. **Connection**: Client opens WebSocket to `/ws/terminal`
2. **PTY spawn**: Server creates a `node-pty` instance (zsh/bash) with `xterm-256color` TERM and a minimal environment to avoid `.env.local` pollution
3. **Message protocol**: Three message types -- `input` (raw keystrokes), `resize` (terminal dimensions), `command` (executed with carriage return)
4. **Bidirectional streaming**: PTY output is JSON-wrapped and sent to xterm.js in the browser
5. **Cleanup**: PTY process is killed when WebSocket closes

Notable: despite the README emphasizing tmux, the WebSocket terminal layer uses `node-pty` directly. tmux is used for session orchestration (creating/monitoring agent panes via `tmux send-keys`), while `node-pty` handles the interactive browser terminal. This is a two-layer approach -- tmux for agent lifecycle, node-pty for user-facing terminal.

### System Dependencies

- Node.js 20+
- tmux (terminal multiplexer backbone)
- ripgrep (code search)
- At least one AI CLI tool

### How It Works

1. **tmux as session backbone**: Each AI coding session runs inside a tmux pane. AgentOS creates, monitors, and controls these panes through tmux commands. This is the same pattern used by claude-squad, workmux, muxtree, and agent-conductor.

2. **Next.js web server**: Runs on port 3011. Serves the mobile-first UI and exposes APIs for session management, git operations, and file browsing.

3. **xterm.js in browser**: Terminal output from tmux panes is streamed to the browser via WebSockets and rendered using xterm.js. Users can type into the terminal from their phone.

4. **SQLite for persistence**: Session metadata, project configuration stored locally via better-sqlite3.

5. **CLI wrapper**: Installed globally via npm (`npm install -g @saadnvd1/agent-os`). Commands: `agent-os run`, `start`, `stop`, `status`, `logs`, `update`.

### Conductor/Worker Model via MCP

Session orchestration follows a conductor/worker architecture using Model Context Protocol (MCP) SDK integration. A conductor agent delegates coding tasks across multiple worker agent instances running in separate tmux panes. This enables:
- Parallel task execution across independent sessions
- Centralized control and monitoring
- Coordinated workflows between agents

This is architecturally similar to GGPrompts/conductor-mcp and gaurav-yadav/agent-conductor, which also use tmux + MCP for multi-agent orchestration. The common pattern: conductor sends instructions via `tmux send-keys`, workers communicate completion via signals or file-based inboxes.

### Git Worktree Isolation

Git worktrees provide branch-level isolation for each session. Each agent operates in its own working directory on its own branch with its own file state. No agent can overwrite another's work. The shared git object store means branches can be compared, merged, and managed through the UI.

Open issue #15 requests "different git worktree for every session" as default behavior, suggesting the current implementation may require manual setup.

### Tauri Desktop Wrapper

The desktop app is a thin Tauri shell around the same web UI. It still requires the backend server to be running. Tauri dependencies (Rust crates like `time`, `bytes`) are managed separately in `src-tauri/`. The desktop app is convenience, not necessity -- the web UI is the primary interface.

### Mobile-First UI Patterns

This is the most distinctive aspect of AgentOS compared to competitors. Key patterns:

#### Purpose-Built Mobile Interface

Not a responsive desktop layout. The mobile view is designed as the primary experience. PR #2 ("make sure mobile view is full screen") was merged early (Jan 15, 2026), indicating mobile-first was a day-one priority.

#### Voice-to-Text Prompting

Dictate prompts to coding sessions hands-free. This enables a "code from the couch" or "code while walking" workflow. Voice input bypasses the pain of typing complex prompts on a phone keyboard.

#### File Upload from Phone

File picker with direct upload from mobile device. Users can browse files on their dev machine and attach files to sessions. PR #4 ("Allow users to drag and drop files directly into the Terminal") extended this to drag-and-drop. PR #7 added a folder picker.

#### Multi-Pane Layout (Up to 4 Sessions)

Side-by-side layout showing up to 4 concurrent sessions. On mobile this likely collapses to tabbed or stacked views, but on tablet/desktop the multi-pane view provides at-a-glance monitoring.

#### Code Search (Cmd+K)

Fast codebase search with syntax-highlighted results via ripgrep. Available from any view, not just the terminal.

#### Git Operations in UI

Status, diffs, commits, PRs managed through the web UI rather than requiring terminal commands. Multi-repository support added in PR #5 (Jan 23, 2026).

### Remote Access Approach

#### Tailscale VPN

AgentOS recommends Tailscale for secure remote access:

1. Install Tailscale on dev machine and phone
2. Authenticate both with same Tailscale account
3. Access AgentOS via Tailscale IP: `http://100.x.x.x:3011`

This is a pragmatic choice: no custom auth system, no HTTPS certificate management, no port forwarding. Tailscale handles encryption, NAT traversal, and device authentication. The trade-off is requiring Tailscale on every accessing device.

**Comparison with banto**: banto runs on a NixOS mini PC at home. Tailscale would work identically for banto's use case. Since banto is single-user, Tailscale's device-level auth is sufficient -- no need for user accounts or login screens.

---

## Well-Regarded Features

Based on HN discussion and GitHub activity:

1. **Multi-agent support**: Broad agent compatibility (8 agents) is appreciated. When a user requested Gemini CLI support, the developer added it within days.

2. **Self-hosted simplicity**: One npm install, one command to start. No Docker, no complex setup.

3. **Mobile-first approach**: The idea of managing coding agents from your phone resonates. Validates the PWA approach.

4. **Active development**: Rapid feature additions (folder picker, multi-repo, drag-and-drop) suggest responsive maintenance.

5. **Free and open-source**: MIT license, no usage limits on the self-hosted version.

---

## Poorly-Regarded Features / Pain Points

From GitHub issues and observable limitations:

### 1. Mobile Browser Bugs (Critical)

- **Issue #20**: "All the UI disappears when opening the keyboard on Chrome Android." This is a fundamental mobile usability bug -- the primary interface breaks when you try to type.
- This suggests the mobile-first claim may outpace the actual mobile polish.

### 2. Browser Compatibility Issues

- **Issue #16**: "Scrolling on Chrome on Windows is not possible." Basic scroll functionality broken on a major browser/OS combination.

### 3. Documentation Gaps

- **Issue #18**: "Usage for agent" -- users don't understand how to use basic functionality.
- No architecture documentation beyond the README feature list.

### 4. Limited Session Resume

Only Claude Code supports session resume and branch forking. All other 7 agents lack these capabilities, which limits the value of persistent session management.

### 5. No Push Notifications

Unlike Happy Coder, there's no notification system for session state changes. Users must actively check the UI to know if a session has completed or errored.

### 6. No End-to-End Encryption

Unlike Happy Coder, session data is stored as plain text. For a self-hosted tool this is less critical, but it's a gap for users who care about security.

### 7. Young Codebase

75 stars, 8 open PRs (mostly automated dependency bumps), only 2 non-bot contributors visible. The bus factor is 1.

---

## User Feedback Summary

### Hacker News (Show HN, Jan 9 2026)

Limited but positive engagement. The developer (saadn92) was responsive to feature requests, implementing Gemini CLI support shortly after it was requested. No significant criticism in the thread.

### GitHub Issues

5 open issues reveal real-world pain points:
- Mobile Chrome Android keyboard bug (#20)
- Windows Chrome scrolling (#16)
- Worktree isolation request (#15)
- Documentation needs (#18)
- Provider expansion request (#22)

### Reddit / Twitter

No significant discussion found. The project is still early-stage and niche.

### Competitive Context

AgentOS sits in a growing category alongside:
- **Omnara** (YC S25, $9/month) -- similar mobile-first approach, now voice-first, commercial
- **Happy Coder** -- free OSS, E2E encryption, push notifications, more mature mobile experience
- **claude-squad** -- TUI-focused, 6.2k stars, larger community but different UX philosophy
- **cmux** -- CLI-focused, notification rings, OSC sequences

---

## Learnings for banto

### What Users Actually Want

- **Push notifications are a differentiator.** AgentOS lacks push notifications; Happy Coder has them and users love them. For banto's "jot, throw, watch" workflow, notifications are essential -- they close the loop between "throw" and "watch." This should be a core feature, not an afterthought.
- **Voice input is a legitimate mobile UX pattern.** Voice-to-text for prompt dictation solves the real pain of typing complex instructions on a phone. banto should consider this, but it can be a later feature. The Web Speech API provides browser-native voice input without backend dependencies.
- **Self-hosted simplicity matters.** AgentOS's one-command install is a strength. banto on NixOS can leverage Nix flakes for even simpler setup: `nix run github:ryo-morimoto/banto`. The installation experience is part of the product.

### Technical Design Lessons

- **tmux is the proven session backend.** Every tool in this category (AgentOS, claude-squad, workmux, muxtree, cmux) uses tmux as the session backbone. banto already plans to use PTY-based sessions; tmux adds multiplexing, detach/reattach, and a proven IPC mechanism (send-keys). However, banto's 1-app architecture with direct PTY management may be simpler and sufficient for a single-user scenario.
- **Git worktree isolation should be default.** AgentOS has worktree support but it's not automatic (issue #15 requests this). For banto, each session should automatically create an isolated worktree. This prevents agent conflicts and makes the "throw multiple agents at different tasks" workflow safe by default.
- **Tailscale is the right remote access pattern.** AgentOS validates Tailscale as the simplest path for single-user self-hosted access. For banto on a NixOS mini PC, Tailscale provides secure remote access without implementing auth, HTTPS, or port forwarding. This should be the recommended (and possibly only) remote access method.

### UX Pattern Lessons

- **Mobile-first is hard to get right.** AgentOS's critical mobile bugs (keyboard hiding UI, scroll issues) demonstrate that claiming "mobile-first" and delivering it are different things. banto should: test on actual mobile devices early and continuously, use the phone keyboard appearance as a core test case, and consider using a battle-tested mobile UI framework rather than custom CSS.
- **Multi-pane layout has limits.** 4 panes side-by-side works on desktop/tablet but is questionable on phone screens. banto should focus on a single-session detailed view for mobile with easy switching, and reserve multi-pane layouts for tablet/desktop. The "one view" principle aligns better with a focused mobile experience.

### Business & Ecosystem Lessons

- **Broad agent support is a growth vector.** AgentOS supports 8 agents. banto starts with Claude Code only (CC only principle), which is correct for focus. But the architecture should not hard-code Claude-specific assumptions into the session layer, in case the user wants to expand later.
- **Conductor/Worker via MCP is interesting but not essential.** The MCP orchestration pattern is powerful for multi-agent coordination, but banto's core use case is "jot, throw, watch" -- not complex inter-agent workflows. This can be explored later once the basic session management is solid.

---

## Sources

### AgentOS

- [GitHub: saadnvd1/agent-os](https://github.com/saadnvd1/agent-os)
- [Show HN: AgentOS](https://news.ycombinator.com/item?id=42641874)

### GitHub Issues

- [#15 — Different git worktree for every session](https://github.com/saadnvd1/agent-os/issues/15)
- [#16 — Scrolling on Chrome on Windows is not possible](https://github.com/saadnvd1/agent-os/issues/16)
- [#18 — Usage for agent](https://github.com/saadnvd1/agent-os/issues/18)
- [#20 — UI disappears when opening keyboard on Chrome Android](https://github.com/saadnvd1/agent-os/issues/20)
- [#22 — Provider expansion request](https://github.com/saadnvd1/agent-os/issues/22)

### Pull Requests

- [#2 — Make sure mobile view is full screen](https://github.com/saadnvd1/agent-os/pull/2)
- [#4 — Allow users to drag and drop files into the Terminal](https://github.com/saadnvd1/agent-os/pull/4)
- [#5 — Multi-repository support](https://github.com/saadnvd1/agent-os/pull/5)
- [#7 — Folder picker](https://github.com/saadnvd1/agent-os/pull/7)

### Competitors

- [Omnara](https://omnara.com/) — YC S25, mobile-first agent management ($9/month)
- [Happy Coder (slopus/happy)](https://github.com/slopus/happy) — Free OSS, E2E encryption, push notifications
- [claude-squad](https://github.com/smtg-ai/claude-squad) — TUI-focused multi-agent session manager
- [cmux](https://github.com/itzg/cmux) — CLI-focused, notification rings, OSC sequences
