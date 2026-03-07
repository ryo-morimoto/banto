# Superset (superset-sh/superset) Research

Date: 2026-03-07
Sources:
- https://github.com/superset-sh/superset
- https://news.ycombinator.com/item?id=47171418
- https://news.ycombinator.com/item?id=46109015
- https://news.ycombinator.com/item?id=46368739

Superset is an Electron desktop app branded as an "IDE for the AI Agents Era," enabling users to run multiple CLI agents (Claude Code, Codex, Cursor Agent, Gemini CLI, etc.) in parallel on their machine. Each agent runs in its own git worktree with automated setup/teardown, persistent terminal sessions via a daemon process, and built-in diff review. The project has 5,234 stars, ships rapidly (v0.0.82 to v1.0.6 in months), and is licensed under Elastic License 2.0 despite marketing as open source. It is macOS-only with no official Linux or Windows support.

---

## Overview

**Repository**: https://github.com/superset-sh/superset
**Stars**: 5,234 | **Forks**: 321 | **Open Issues**: 279 (26 labeled as bugs)
**Created**: 2025-10-21 | **Latest Release**: desktop-v1.0.6 (2026-03-05)
**License**: Elastic License 2.0 (ELv2) -- NOT Apache 2.0 despite README badge
**Tagline**: "IDE for the AI Agents Era - Run an army of Claude Code, Codex, etc. on your machine"

---

## Architecture

### High-Level Structure

Bun + Turborepo monorepo with Biome (lint/format). The product is an **Electron desktop app** with a cloud backend for team features.

```
apps/
  desktop/     -- Electron app (the core product)
  web/         -- Web app (app.superset.sh) for cloud/team features
  api/         -- API backend (cloud)
  marketing/   -- Marketing site (superset.sh)
  admin/       -- Admin dashboard
  docs/        -- Documentation site
  mobile/      -- React Native (Expo) mobile app
  streams/     -- Electric SQL streaming
  electric-proxy/ -- Cloudflare worker for Electric SQL CDN caching

packages/
  ui/          -- Shared UI components (shadcn/ui + Tailwind v4)
  db/          -- Drizzle ORM schema (cloud Neon PostgreSQL)
  local-db/    -- Drizzle ORM schema (local SQLite via better-sqlite3)
  auth/        -- Authentication (Better Auth, migrated from Clerk)
  trpc/        -- Shared tRPC definitions
  agent/       -- Agent logic
  mcp/         -- MCP server (cloud)
  desktop-mcp/ -- MCP server (desktop-specific)
  chat/        -- Chat package
  chat-mastra/ -- Mastra-based chat (AI chat within Superset)
  shared/      -- Shared utilities
  email/       -- Email templates
  scripts/     -- CLI tooling (currently empty)
```

### Desktop App Architecture

**Stack**: Electron 40 + React 19 + Vite (electron-vite) + TanStack Router + Zustand + tRPC (trpc-electron)

The desktop app has a classic Electron split:
- **Main process** (`apps/desktop/src/main/`): Terminal management, daemon, git operations, agent setup, notifications, tRPC server
- **Renderer** (`apps/desktop/src/renderer/`): React UI with screens, components, stores (Zustand)
- **Preload** (`apps/desktop/src/preload/`): IPC bridge

Key main-process modules:
- `lib/terminal/daemon/` -- Daemon-based terminal manager
- `lib/workspace-runtime/` -- Runtime abstraction layer (local, SSH, future cloud)
- `lib/agent-setup/` -- Agent wrapper scripts for Claude, Codex, Cursor, Gemini, Copilot, OpenCode, Mastra
- `lib/notifications/` -- Agent notification server (HTTP endpoint agents POST to)
- `terminal-host/` -- Daemon process itself (runs as ELECTRON_RUN_AS_NODE)
- `git-task-worker.ts` -- Worker thread for git operations

**Takeaway**: Electron's main/renderer/preload split maps to banto's server/client split. banto's Elysia server IS the main process, the browser IS the renderer, and HTTP/WebSocket IS the IPC bridge -- no Electron overhead needed.

### Daemon Architecture for Session Persistence

This is Superset's most architecturally interesting feature. Implemented in PR #619.

```
Electron Main Process
  (DaemonTerminalManager)
       |
       | Unix socket (NDJSON protocol for control + binary framing for stream)
       v
Terminal Host Daemon Process
  (runs as ELECTRON_RUN_AS_NODE, detached, survives app restart)
       |
       | node-pty
       v
PTY Subprocess 1..N (one per terminal pane)
```

Key design decisions:
- **Daemon is a child Electron process** running with `ELECTRON_RUN_AS_NODE` flag, detached from the main process
- **Sessions survive app restarts** -- the daemon keeps PTY processes alive
- **Cold restore**: If daemon doesn't have a session but on-disk scrollback exists (unclean shutdown), UI shows restored scrollback without spawning shell until user clicks "Start Shell"
- **Bounded warm set**: Only 8 terminal tabs stay mounted on startup (CSS `visibility: hidden`), not all
- **Concurrency limits**: Max 3 concurrent attaches, max 3 concurrent PTY spawns
- **Scrollback persistence**: 512KB max history per session, written to disk
- **Session management UI**: Settings > Terminal > Manage sessions (kill individual/all, clear history)

Constants:
```typescript
SESSION_CLEANUP_DELAY_MS = 5000
CREATE_OR_ATTACH_CONCURRENCY = 3
MAX_SCROLLBACK_BYTES = 500_000
MAX_HISTORY_SCROLLBACK_BYTES = 512 * 1024
MAX_KILLED_SESSION_TOMBSTONES = 1000
```

**Takeaway**: A daemon process for session persistence is critical. banto's Elysia server IS the daemon -- no separate process needed, but the same cold-restore and bounded-warm-set patterns should be adopted.

### Git Worktree Management

Each "workspace" in Superset maps to a git worktree. The data model:

```
Project (git repository)
  -> Worktree (git worktree, physical directory)
    -> Workspace (UI workspace, references a worktree or branch)
```

**Setup/Teardown Scripts**: Projects can define `.superset/config.json`:
```json
{
  "setup": ["./.superset/setup.sh"],
  "teardown": ["./.superset/teardown.sh"]
}
```

Scripts receive environment variables:
- `SUPERSET_WORKSPACE_NAME` -- Name of the workspace
- `SUPERSET_ROOT_PATH` -- Path to the main repository

Typical setup: copy `.env`, install dependencies. Teardown: cleanup.

**Branch management**: Auto-generated branch names from prompts (buggy -- issues #2094, #2095), configurable branch prefix (per-project or global), case preservation (was buggy -- #2098, #2103).

**Takeaway**: Worktree-per-task is the core isolation model. banto should adopt it with project-level setup/teardown scripts, but keep branch naming simple and deterministic to avoid Superset's generation bugs.

### Built-in Diff Viewer

Uses **Monaco Editor** (`@monaco-editor/react`) `DiffEditor` component. Not a custom diff implementation.

Features:
- Side-by-side and inline view modes
- Editable diffs (can modify files directly in the diff view)
- Hide unchanged regions option
- Auto-scroll to first diff on mount
- File diff sections with headers, organized by commit
- `@pierre/diffs` library for diff parsing
- `InfiniteScrollView` for large change sets
- Lazy rendering (PR #2099 fixed scroll performance)

**Known issue**: Massive CPU spike with large diffs (>5000 files, >400 commits) -- issue #1703, still open.

**Takeaway**: Monaco DiffEditor is powerful but heavyweight. banto should start with a simpler diff renderer (server-side `git diff` + lightweight HTML display) and add richness incrementally.

### IDE Integration

Superset wraps CLI agents and hooks into their notification systems:

**Claude Code**: Writes a `claude-settings.json` with hooks for `UserPromptSubmit`, `Stop`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`. Each hook calls a `notify.sh` that POSTs to a local HTTP server in Superset's main process.

**Codex**: Similar wrapper with a custom exec template.

**Cursor Agent**: Writes `~/.cursor/hooks.json` with hook entries pointing to Superset's notification script. Merges with existing user hooks.

**Gemini CLI**: Custom settings JSON + hook script.

**Copilot**: Hook script integration.

**OpenCode**: Plugin file (`superset-notify.js`) installed globally.

**External editors**: One-click "Open in..." for VS Code, Cursor, all JetBrains IDEs (IntelliJ, WebStorm, GoLand, PyCharm, etc.), Zed, Sublime, Xcode, Terminal, Finder, Ghostty, iTerm, Warp.

**Takeaway**: Hook-based agent state detection (via `notify.sh` POSTing to a local HTTP server) is the right pattern. banto's Elysia server can receive these hooks directly -- no wrapper scripts needed, just Claude Code's native hook config.

### Data Persistence

**Local (SQLite via better-sqlite3 + Drizzle ORM)**:
- `projects` -- Git repositories
- `worktrees` -- Git worktrees with git/GitHub status
- `workspaces` -- Active workspace state (tab order, last opened, port allocation, etc.)
- `settings` -- User preferences (terminal presets, font, ringtone, branch prefix config, etc.)
- `browser_history` -- In-app browser URL autocomplete
- 34 migrations so far (rapid schema evolution)

**Cloud (Neon PostgreSQL + Drizzle ORM)**:
- `users`, `organizations`, `organization_members` -- Auth/team data
- `tasks` -- Task management (syncs bidirectionally with Linear)
- Synced to local SQLite via **Electric SQL** for offline-first reads

**Sync architecture**: Electric SQL streams from Neon -> Cloudflare CDN proxy -> Electron app. TanStack DB + TanStack Electric DB Collection for client-side reactive queries.

**Takeaway**: Superset's dual-DB (SQLite + PostgreSQL) and Electric SQL sync is cloud-team complexity banto does not need. SQLite-only with WebSocket push for real-time UI updates is the right call.

### Terminal Implementation

Uses **xterm.js** (beta channel: `@xterm/xterm@6.1.0-beta.148`) with addons:
- WebGL renderer (`@xterm/addon-webgl`)
- Fit addon (`@xterm/addon-fit`)
- Search, clipboard, image, ligatures, unicode11, serialize addons
- `@xterm/headless` for server-side terminal emulation in the daemon

**Takeaway**: xterm.js with headless server-side emulation enables scrollback persistence. banto's restty/ghostty-web approach should ensure equivalent server-side state capture for crash recovery.

### Chat/AI Integration

Recently added a Mastra-based chat system (`packages/chat-mastra/`):
- Uses Vercel AI SDK (`ai` v6, `@ai-sdk/anthropic`, `@ai-sdk/openai`)
- Mastra framework (forked: `mastracode` custom build)
- TipTap rich text editor for chat input
- Server via Hono + tRPC
- Supports questions, approvals, and plan display from agents

**Takeaway**: Superset bolted on a full chat framework (Mastra + Vercel AI SDK) as a separate package. banto should avoid this -- Claude Code's TUI already handles chat. The embedded terminal IS the chat interface.

### MCP Integration

`packages/mcp/` exposes workspace management tools to agents:
- `create-workspace`, `delete-workspace`, `update-workspace`
- `list-workspaces`, `get-workspace-details`, `switch-workspace`
- `list-devices`, `list-projects`, `get-app-context`
- `start-agent-session`

`packages/desktop-mcp/` -- Desktop-specific MCP server for local operations.

**Takeaway**: Exposing workspace management as MCP tools is over-engineering for a single-user tool. banto should keep workspace operations as regular API endpoints, not MCP servers.

---

## Well-Regarded Features

### Parallel Agent Execution + Worktree Isolation

This is the core value proposition and what users praise most. Running 10+ agents simultaneously, each in its own git worktree, prevents agents from conflicting with each other. The README emphasizes: "Wait less, ship more."

### Terminal Persistence (Daemon)

PR #619 (6 comments, most discussion of any PR) implemented daemon-based session persistence. Terminals survive app restarts. This solved the critical pain point of losing agent sessions when the app crashes or restarts.

### Agent Monitoring + Notifications

Visual status indicators in the workspace sidebar showing which agents are working, idle, or need permission. Desktop notifications when agents complete or need attention. Uses agent hook systems (Claude hooks, Cursor hooks, etc.) to detect state changes.

### Built-in Diff Viewer

Editable Monaco-based diff viewer lets users review and modify agent changes without leaving the app. Organized by commits with infinite scroll.

### Universal Agent Compatibility

Works with any CLI agent (Claude Code, Codex, Cursor Agent, Gemini CLI, Copilot, OpenCode). The wrapper/hook system is extensible. Users frequently praise this flexibility.

### IDE Integration

One-click to open any workspace in favorite editor. Supports broad IDE ecosystem (VS Code, Cursor, JetBrains family, Zed, etc.).

### Setup/Teardown Scripts

Automated environment setup per worktree (copy .env, install deps, etc.) reduces manual overhead when spawning many parallel workspaces.

### Rapid Iteration

The team ships extremely frequently -- from v0.0.82 to v1.0.6 in a few months. 2122+ issues/PRs. Responsive to bug reports (often same-day fixes). Active community on Discord.

---

## Poorly-Regarded Features / Pain Points

### Platform Support (macOS Only, Critical Gap)

**Requirements state**: "macOS (Windows/Linux untested)"

- **No Linux support**: AppImage exists but is untested. The app is Electron, so it could run on Linux, but no official support.
- **No Windows support**: Issue #2100 is open for Windows build support. WSL partially works with workarounds (#1993).
- **No x86 Mac**: Issue #2033 (+3 upvotes) requests Intel Mac support.
- **SSH support is WIP**: PR #788 (+4 upvotes) added SSH remote workspaces but noted as incomplete.

### Stability Issues

Multiple reports of workspaces breaking after updates:
- #1655: "Workspaces stopped working in 0.0.82" -- User: "very unintuitive and frustrating - lost a lot of time on this"
- #1838: Status indicators and notifications broke after 0.0.87 update
- #1836: Cmd+click links broken in terminal after 0.0.87 (still broken in 0.0.88, multiple users confirm)
- #1830: Terminal input bar appears twice, auto-scroll issues

### Shell Wrapper Conflicts

The agent wrapper system can conflict with user configurations:
- #1812: "Superset terminal overrides existing claude() wrapper and breaks Bedrock auth" -- Superset's claude wrapper takes precedence over user-defined wrappers
- #2122: Agent doesn't inherit GITHUB_TOKEN from ~/.zshrc
- #1985: Shell wrapper precedence issues under prompt hooks

### Diff Viewer Performance

- #1703: "massive CPU spike and unusable lag in UI when there is a large diff" (>5000 files, >400 commits). Still open.
- #2099: Fixed lazy rendering and scroll performance, but large diffs remain problematic.

### Mandatory Login / No Offline Mode

- #1722: "I'd love to still access my local worktrees even when I'm not logged in." The app gates ALL functionality behind authentication.
- #2037: App shows blank screen when PostHog analytics domains are blocked by DNS -- the app literally breaks if analytics tracking is blocked.
- #1937: "Logged out state showing up repeatedly"

### License (ELv2, Not True Open Source)

Despite marketing as "completely free and open source," the actual license is **Elastic License 2.0**, which:
- Prohibits providing the software as a hosted/managed service
- Prohibits circumventing license key functionality
- Is NOT an OSI-approved open source license

The README badge says "Apache-2.0" but the LICENSE.md contains ELv2. This is misleading.

### Terminal Issues

- #1830: Input bar appears twice when switching away and back
- #1873: Terminal stuck/blank when switching between tabs
- #1595: Cursor agent always scrolls
- #1637: Browser pane reloads every time you switch away and back

### Branch Name Generation Bugs

- #2094: Auto-generated branch name not working
- #2095: Auto-generated branch name ignores user prompt
- #2098/#2103: Branch prefix case preservation causing worktree corruption

### Freemium Model

The product has evolved from "completely free" to a freemium model:
- Better Auth + Stripe billing integration (PRs #908, #1977, #2092)
- Enterprise tier (admin-managed, custom pricing)
- Task management tied to Linear integration is a paid feature
- Issue #1926: User explicitly says "I paid for it but was quite disappointed by the execution"

### Resource Usage

- #2074: Resource monitor shows over 100% CPU
- Memory/CPU overhead of Electron + daemon + multiple PTY processes

### Top Issues by Reaction Count

| Reactions | Issue # | Title | Theme |
|-----------|---------|-------|-------|
| 10 | [#1513](https://github.com/superset-sh/superset/issues/1513) | [feat] use in ssh server | Remote access |
| 9 | [#405](https://github.com/superset-sh/superset/issues/405) | Linux support | Platform support |
| 9 | [#1601](https://github.com/superset-sh/superset/issues/1601) | [feat] Consider using Conductor's Spotlight testing for workspace iteration | Workflow / testing |
| 7 | [#499](https://github.com/superset-sh/superset/issues/499) | [feat] windows support | Platform support |
| 5 | [#751](https://github.com/superset-sh/superset/issues/751) | [feat] custom fonts | Terminal UX |
| 5 | [#788](https://github.com/superset-sh/superset/issues/788) | feat(desktop): add SSH remote workspace support | Remote access |
| 4 | [#935](https://github.com/superset-sh/superset/issues/935) | [feat] All diff commenting | Code review |
| 4 | [#708](https://github.com/superset-sh/superset/issues/708) | [Enhancement] Full commit graph + repo housekeeping | Git tooling |
| 3 | [#1375](https://github.com/superset-sh/superset/issues/1375) | [feat] Vim motion support to navigate superset | Terminal UX |
| 3 | [#1814](https://github.com/superset-sh/superset/issues/1814) | [feat] allow branch prefixes without '/' | Git tooling |
| 3 | [#2033](https://github.com/superset-sh/superset/issues/2033) | [feat] support x86 mac os | Platform support |
| 2 | [#603](https://github.com/superset-sh/superset/issues/603) | [feat] Port Labeling via User-Defined Scripts | Dev environment |
| 2 | [#1461](https://github.com/superset-sh/superset/issues/1461) | [bug] Notifications and task status not working on macOS 26.2 | Stability |
| 2 | [#773](https://github.com/superset-sh/superset/issues/773) | Feature suggestions for terminal tab management | Terminal UX |
| 2 | [#945](https://github.com/superset-sh/superset/issues/945) | [feat] add support for JJ based repositories | VCS support |

**Theme summary**: Platform support (Linux/Windows/x86 Mac) and remote access (SSH) dominate. Users want Superset everywhere, not just macOS ARM. Terminal UX customization (fonts, vim motions, tabs) is the second cluster. banto's web-based PWA architecture sidesteps the platform support problem entirely.

---

## User Feedback Summary

**Negative**:
- "very unintuitive and frustrating - lost a lot of time on this" (#1655 -- workspaces broken after update)
- "I paid for it but was quite disappointed by the execution due to the issues described above" (#1926 -- about task management/Linear integration)
- "I'd love to still access my local worktrees even when I'm not logged in" (#1722 -- offline mode request)
- "our wrapper logic does not run [...] claude in Superset uses the wrong AWS identity and fails with Bedrock 403" (#1812 -- shell wrapper conflicts)
- "Yea I find it hit and miss, always have. Often have to click around, select text, do random stuff on the terminal window and then suddenly the url link will activate" (#1836 -- Cmd+click links)

**Positive** (from maintainer responsiveness):
- "looks like it got fixed in 0.0.88" (#1838 -- rapid fix turnaround)
- Maintainer: "Sorry about this, I added 3 mechanisms in the next release to solve this. [...] Very sorry again I know this was very frustrating. Working hard on stabilizing the product more" (#1655)

### User Quotes from HN / External Sources

**Positive**:
- "I have been using Superset and it has worked really well to automate creating & deleting worktrees, with their own terminals" -- it's "really just a terminal emulator w/ a bunch of extra helpers to make coding agents work well" and doesn't try to wrap Claude or Codex in its own UI. (HN, user: cschneid)
- "this agent first approach is really cool. Feel like I have pushed the traditional IDE workflows to their max" (HN, user: eabnelson)
- "I've used superset at work this last week, and it's great!" (HN, user: roggenbuck)

**Skeptical / Negative**:
- "Is this what I'm coming back to? Because honestly I hate it." (HN, user: kimos)
- "IDK what everyone is doing anymore. Just why do you need 10 parallel agents doing things." (HN, user: xmonkee)
- "How are people productive using 10 parallel agents? Doesn't human review time become a bottleneck?" (HN, user: thorum)
- "It's a shame they didn't pick a name different from Apache Superset" (HN, user: nrjames)

**Note**: No Reddit threads discussing superset.sh were found as of 2026-03-07. Discussion is concentrated on Hacker News and GitHub Issues.

---

## Learnings for banto

### What Users Actually Want

**Worktree-per-task isolation**: This is the killer feature. banto should make git worktree management first-class. Each task gets its own worktree with automated setup/teardown scripts.

**Agent notification hooks**: Using Claude Code hooks (UserPromptSubmit, Stop, PostToolUse, PermissionRequest) to detect agent state is smart. banto already plans to use Claude Code; implementing hook-based state detection is essential for the "watch" part of "jot, throw, watch."

**Daemon for session persistence**: A separate process that keeps PTY sessions alive across app restarts is critical for reliability. banto's Elysia server could spawn a similar daemon subprocess. Key design: Unix socket with NDJSON protocol for control, binary framing for terminal data.

**Setup/teardown scripts**: Simple, powerful pattern. A `.banto/config.json` with setup/teardown arrays, environment variables injected (`BANTO_TASK_NAME`, `BANTO_ROOT_PATH`).

**Cold restore semantics**: When a session crashes, showing the last scrollback without auto-spawning a new shell lets users decide what to do. Good UX for crash recovery.

**Bounded warm set**: Don't mount all terminals on startup. Only mount the active one + a few recently used ones. Lazy-load the rest.

**High priority (core value)**:
- Worktree isolation per task
- Terminal persistence (server-side, not daemon -- banto's server IS the daemon)
- Agent hook-based state detection
- Setup/teardown scripts per project

**Medium priority (quality of life)**:
- Diff viewer (but start simple, not Monaco)
- Notification when agent needs attention
- One-click open in editor

**Low priority / Skip**:
- Multi-agent support beyond Claude Code (CC only principle)
- Cloud sync / team features (single user)
- Built-in chat with AI (already have Claude Code)
- Built-in browser pane
- MCP server for workspace management (over-engineering for single user)

### Technical Design Lessons

**Mandatory cloud auth for local features**: banto runs on a local NixOS machine. All features should work offline, always. No authentication gate for local worktree/task management. Superset's biggest user complaint.

**Analytics that can break the app**: PostHog blocking causing a blank screen is inexcusable. Any analytics in banto must fail silently with zero impact on functionality.

**Shell wrapper conflicts**: Superset's aggressive shell function overriding breaks user setups. If banto wraps `claude`, it should use PATH-based delegation (`command claude`) and never override user-defined shell functions.

**Electron for a single-user local tool**: Superset chose Electron because they need a desktop app for multiple platforms. banto runs on one NixOS machine and is accessed via browser (PWA). This is architecturally simpler and avoids Electron's memory/CPU overhead.

**Monaco for diffs**: Monaco's DiffEditor is heavyweight and causes CPU issues with large diffs. Consider lighter alternatives or at least lazy rendering with pagination from the start.

**Rapid schema evolution without stability**: Superset has 34 SQLite migrations in ~5 months. This suggests the data model wasn't well-planned. banto should invest more in upfront schema design.

| Aspect | Superset | banto |
|--------|----------|-------|
| Platform | Electron desktop app (macOS) | Web dashboard (PWA) on NixOS |
| Terminal | xterm.js in Electron renderer | Browser terminal (restty/ghostty-web candidate) |
| DB | SQLite (local) + Neon PostgreSQL (cloud) | SQLite only |
| Auth | Better Auth + Clerk (migrated) | None needed (single user, local) |
| Agent support | Any CLI agent | Claude Code only |
| Session persistence | Daemon process (ELECTRON_RUN_AS_NODE) | Server-side (Elysia process itself) |
| Sync | Electric SQL (cloud -> local) | Not needed |
| IPC | trpc-electron (main <-> renderer) | HTTP/WebSocket (Elysia <-> browser) |

1. **Terminal session model**: Superset's `createOrAttach` pattern with deduplication of concurrent calls for the same pane ID is good. Implement this in banto's session runner.

2. **Scrollback persistence**: Writing serialized terminal state (via `@xterm/addon-serialize`) to disk enables crash recovery. banto should do this for session events.

3. **Agent state detection via hooks**: The `notify.sh` pattern -- a small script that POSTs to a local HTTP endpoint when agent state changes -- is simple and effective. banto's Elysia server can receive these directly.

4. **Worker threads for git operations**: Superset offloads git diff computation to a worker thread (`git-task-worker.ts`) to avoid blocking the main process. banto should consider this for diff generation.

5. **Worktree cleanup is hard**: Superset tracks `deletingAt` timestamps on workspaces, has teardown scripts, and still has race conditions. Plan for async cleanup with error handling.

6. **Port allocation per workspace**: Each workspace gets a range of 10 ports starting from a `portBase`. This prevents dev server conflicts across worktrees. Simple and effective.

7. **Concurrency limits matter**: Max 3 concurrent PTY spawns, max 3 concurrent attaches, priority-based semaphore. Without these, spawning many workspaces at once causes resource exhaustion.

### UX Pattern Lessons

**ELv2 / misleading license claims**: banto is OSS. Use a real open source license and be honest about it.

### Business & Ecosystem Lessons

The product has evolved from "completely free" to a freemium model with Better Auth + Stripe billing integration (PRs #908, #1977, #2092), enterprise tier, and paid Linear integration. This shift generated user pushback (issue #1926). banto avoids this entirely as a single-user local tool with no monetization requirement.

The ELv2 license (marketed as open source despite not being OSI-approved) creates trust issues. banto should use a genuine open source license.

---

## Sources

- GitHub Repository: https://github.com/superset-sh/superset
- HN Discussion (2026-03): https://news.ycombinator.com/item?id=47171418
- HN Discussion (2025-12): https://news.ycombinator.com/item?id=46109015
- HN Discussion (2026-01): https://news.ycombinator.com/item?id=46368739
