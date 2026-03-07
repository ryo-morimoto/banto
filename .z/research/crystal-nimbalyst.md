# Crystal / Nimbalyst Research

Date: 2026-03-07
Sources:
- https://github.com/stravu/crystal
- https://nimbalyst.com
- https://docs.nimbalyst.com
- https://github.com/Nimbalyst/nimbalyst
- https://news.ycombinator.com/item?id=44259353
- https://news.ycombinator.com/item?id=44324326

Crystal was a desktop app for managing multiple Claude Code sessions in parallel git worktrees. Deprecated February 2026, succeeded by Nimbalyst — an expanded "agent-native visual workspace" by the same team (Stravu).

---

## Overview

Crystal was born from the frustration of managing multiple Claude Code sessions from the command line. The team described it as "cumbersome and confusing" — requiring several commands to switch sessions, forgetting what each was doing, no easy tracking. Crystal solved this by providing a GUI for parallel agent sessions with git worktree isolation.

Nimbalyst expands Crystal into a full workspace: WYSIWYG markdown editor, Monaco code editor, task tracking, Excalidraw/Mermaid diagrams, terminal, and multi-agent support (Claude Code + Codex). Branded as an "Integrated Vibe Environment (IVE)."

**Company:** Stravu (also builds a team collaboration platform)
**License:** Crystal was open source. Nimbalyst is closed-source with free tier.
**Platforms:** macOS (Apple Silicon/Intel), Windows 10+, Linux. iPhone companion app for Nimbalyst.

---

## Architecture

### Crystal (Original)

- **Desktop:** Electron
- **Frontend:** TypeScript/React (96.8% of codebase)
- **Build:** Node.js + pnpm workspace
- **Testing:** Playwright
- **Session isolation:** Each agent session runs in its own git worktree
- **Agent support:** Claude Code initially, Codex added in v0.3.0

Repository structure:
```
frontend/         # React UI (Vite + Tailwind CSS)
  src/            # Components, state, views
main/             # Electron main process
  src/
    services/     # Core business logic (~36 files)
      sessionManager.ts
      worktreeManager.ts
      worktreeNameGenerator.ts
      terminalSessionManager.ts
      terminalPanelManager.ts
      gitDiffManager.ts
      gitFileWatcher.ts
      gitPlumbingCommands.ts
      gitStatusManager.ts
      gitStatusLogger.ts
      permissionManager.ts
      mcpPermissionBridge.ts
      mcpPermissionServer.ts
      stravuMcpService.ts
    ipc/          # Electron IPC channels (~25 handlers)
      session.ts          # Session lifecycle
      git.ts              # Git operations
      claudePanel.ts      # Claude agent panel
      codexPanel.ts       # Codex agent panel
      baseAIPanelHandler.ts  # Shared AI panel logic
      project.ts          # Project config
      prompt.ts           # Prompt handling
      commitMode.ts       # Commit operations
      dashboard.ts        # Dashboard state
      panels.ts           # Panel management
    database/     # Data persistence
    types/        # TypeScript type definitions
  build-mcp-bridge.js  # MCP protocol bridge build
shared/           # Shared types (types.ts + types/)
tests/            # Playwright e2e tests
scripts/          # Build utilities
docs/             # Documentation
```

#### Session & Worktree Management

Crystal's main process orchestrates sessions through a layered service architecture:

- **`sessionManager.ts`** handles session lifecycle (create, resume, terminate) and coordinates with the worktree and terminal managers.
- **`worktreeManager.ts`** wraps git worktree operations — creating isolated worktrees for each session, cleaning up on session end. **`worktreeNameGenerator.ts`** auto-generates worktree directory names.
- **`terminalSessionManager.ts`** and **`terminalPanelManager.ts`** manage PTY instances per session, routing terminal I/O through Electron IPC.
- **`baseAIPanelHandler.ts`** provides a shared abstraction for AI agent panels, with **`claudePanel.ts`** and **`codexPanel.ts`** as concrete implementations.
- Git status is tracked via **`gitStatusManager.ts`** + **`gitFileWatcher.ts`**, with **`gitPlumbingCommands.ts`** providing low-level git operations. The polling-based `gitStatusManager` was a major performance bottleneck (40%+ CPU), later optimized.
- MCP integration uses a bridge pattern: **`build-mcp-bridge.js`** builds the bridge, **`mcpPermissionBridge.ts`** and **`mcpPermissionServer.ts`** handle permission scoping per session.

#### IPC Architecture

The `ipc/` directory defines ~25 channel handlers, one per domain. The renderer (React frontend) communicates with the main process through typed IPC channels exposed via `preload.ts`. Key channels include `session` (lifecycle), `git` (operations), `claudePanel`/`codexPanel` (agent control), `dashboard` (state sync), and `prompt` (prompt routing).

### Nimbalyst (Successor)

- **Desktop:** Electron (continued)
- **Editor:** Lexical (Meta's editor framework) for WYSIWYG markdown, Monaco for code
- **Terminal:** Embedded ghostty terminal
- **Storage:** Plain markdown and standard files on filesystem — no proprietary formats
- **Agent integration:** Claude Code and Codex via chat interface with / commands, skills, MCP support
- **Git:** Visual diffs, branch management, worktree support per-session
- **Data:** Local-first, optional GitHub sync. SOC 2 Type 2 certified.

---

## Well-Regarded Features

### 1. Git Worktree Isolation (Core Innovation)

Each agent session operates in its own git worktree, preventing conflicts between parallel work. This is the defining design decision — it enables the "run multiple approaches, pick the winner" workflow.

- Multiple sessions can work on the same problem with different prompts
- Each worktree has its own editor context and agent sessions (Nimbalyst)
- Syntax-highlighted diffs, squash-and-rebase, merge back to main

User sentiment: This is consistently cited as the reason people adopt Crystal over raw terminal sessions.

### 2. Session Management UI

Visual dashboard replacing the "which terminal is which?" problem:

- Auto-naming sessions from prompts
- Visual status indicators (initializing, running, waiting, completed)
- Searchable session history with resume capability
- Kanban view for session organization (Nimbalyst)
- Session linking to files (bidirectional)

### 3. Session Templates

Create multiple numbered sessions from a single template with one click. Enables rapid A/B/C testing of different prompts or approaches.

### 4. Parallel Approach Comparison

Side-by-side comparison of different implementations. Key use cases:
- Run the same prompt N times, pick the best result
- Work on feature A while inspecting/testing feature B
- Compare Claude Code vs Codex on the same task (Nimbalyst)

### 5. Integrated Build-and-Run

Push-button testing: launch changes for testing via configured build-and-run scripts without leaving the app.

### 6. Multi-Agent Support (Nimbalyst)

Run Claude Code and Codex side-by-side with shared context, MCP servers, and unified workflow. Multiple agents per worktree.

### 7. Open Storage Format (Nimbalyst)

All content stored as plain markdown and standard files. No vendor lock-in. Git-friendly, LLM-compatible.

User quote: "Nimbalyst has quickly become my indispensable daily driver for Claude Code. The user experience is vastly superior to using it in the terminal."

---

## Poorly-Regarded Features / Pain Points

### 1. Performance Issues (Significant)

The changelog reveals escalating performance problems as features grew:

- v0.3.1: "40%+ CPU reduction through git status polling optimizations" — git polling was hammering the CPU
- v0.3.1: Eliminated "2800ms+ frame drops during terminal output processing" — UI would freeze for nearly 3 seconds
- v0.2.1: Required "adaptive debouncing" for terminal processing
- Electron overhead compounding with multiple agent sessions and worktrees

### 2. Security Addressed Reactively

v0.1.15 patched "potential command injection vulnerabilities in git operations" and "potential XSS vulnerability." Security was bolted on after the fact.

### 3. Context Bleeding Bug

Issue #233: "autocontext bleeding into agent's main workspace" — isolation wasn't complete, with autocontext settings leaking between sessions.

### 4. Stability Issues

- Issue #228: "Crystal unable to start Claude Code?" — launch failures
- Issue #221: "'Full Access' mode switches back to 'Workspace', tasks hanging" — mode reversion causing task failures
- Issue #216: Recurring errors at session termination
- Issue #200: "mac release 0.3.0 doesn't show any window" — app wouldn't display
- Issue #202: "Terminal tab text formatting messes up after switching to Claude tab" — rendering corruption

### 5. Poor Commit Message Generation

Issue #222: "Crystal creates poor commit message" — AI-generated commit messages lacked quality.

### 6. Limited LLM Provider Support

Multiple discussion requests for:
- Local LLM endpoints (LM Studio, Ollama)
- Multiple LLM provider support beyond Claude
- Custom environment variables for Google LLM compatibility

Crystal was Claude-first, and users wanted flexibility. Nimbalyst partially addressed this with Codex support and BYOK.

### 7. Documentation Gaps

Multiple unanswered Q&A discussions:
- "How to activate plan mode?" — unanswered
- "Best Practices for Multiple Runs" — unanswered
- "Create multiple sessions in parallel -- from prompt?" — unanswered

### 8. Package Naming Conflict

Issue #236: "crystal" conflicts with the Crystal programming language compiler package on Debian/Ubuntu.

### 9. No Remote/Headless Support

HN user asked about remote connectivity — Crystal required a local desktop. No SSH/headless mode.

### 10. Scope Creep Leading to Deprecation

Crystal's architecture couldn't sustain the expanding vision (editor, task tracking, diagrams, mobile). The team deprecated it after ~8 months rather than refactoring, building Nimbalyst as a closed-source replacement. This suggests the original architecture was too narrowly scoped.

---

## User Feedback Summary

### Hacker News

- Generally positive reception but limited discussion (6 comments on launch post)
- Posted 3 times in quick succession (flagged by gnabgib), suggesting aggressive marketing
- Described by creator as "the first IVE (Integrated Vibe Environment)"
- One commenter noted it as "a great idea" for agentic workflows
- Remote connectivity was raised as a missing feature
- Later HN mentions reference Crystal alongside claude-squad and similar tools

### GitHub Issues & Discussions

- 16+ open issues at time of deprecation
- Most issues are stability/UX bugs rather than fundamental design complaints
- Feature requests cluster around: more LLM providers, containerized execution, remote access
- Several Q&A discussions went unanswered, suggesting understaffed community support
- Issue #235: "Project dead?" — community uncertainty about project direction before Nimbalyst announcement

### Product Hunt / Marketing Quotes

- "Nimbalyst has quickly become my indispensable daily driver for Claude Code."
- "Nimbalyst is my preferred way of working whether coding or planning my demos."
- "The local WYSIWYG editor for markdown, mockups, and diagrams makes the whole workflow feel much smoother."

Note: These quotes appear in marketing contexts and may not represent independent user reviews.

### Overall Sentiment

Crystal filled a real gap (multi-session Claude Code management) but suffered from Electron performance issues, stability bugs, and limited community support. The pivot to Nimbalyst expanded scope dramatically, but moved from OSS to closed-source, which may alienate the original user base.

---

## Learnings for banto

### What Users Actually Want

- **Git worktree isolation is the right primitive.** Crystal validated that git worktrees are the natural isolation boundary for parallel agent sessions. banto should treat worktree-per-session as a first-class concept. This maps well to banto's existing nixos-container + session model.
- **Session identity must be visual and persistent.** The #1 pain point Crystal solved was "which terminal is which?" banto's single-screen dashboard already addresses this, but should ensure: sessions auto-named from prompts/tasks, visual status indicators (running, waiting, completed, error), and searchable session history.
- **"Run N, pick winner" is a compelling workflow.** Session templates that spawn multiple parallel sessions from one prompt are highly valued. banto could support this as a task-level feature: "Run this task 3 times in parallel, compare results."

### Technical Design Lessons

- **Performance is non-negotiable for multi-session UIs.** Crystal's Electron app hit severe performance walls (2800ms frame drops, 40%+ excess CPU from git polling). banto runs in a browser, which avoids Electron overhead, but must still: avoid polling-based architectures for status updates (use WebSocket push), debounce terminal output processing, and be cautious about rendering multiple live terminals simultaneously.
- **Commit message quality matters.** Crystal users complained about poor auto-generated commit messages. If banto generates commits, invest in quality or let the agent handle it with proper prompting.
- **Open storage formats build trust.** Nimbalyst's plain markdown storage is well-received. banto uses SQLite (appropriate for a dashboard), but should ensure session logs and outputs are easily exportable/inspectable.

### UX Pattern Lessons

- **Avoid scope creep into editor territory.** Crystal died because it tried to become a full IDE/editor (Nimbalyst). banto's "jot, throw, watch" principle is the antidote: banto manages tasks and watches agents, it doesn't replace the editor. The editor is the user's existing tool (VS Code, Neovim, etc.).
- **Mobile companion is a nice-to-have.** Nimbalyst's iPhone app for monitoring sessions from anywhere aligns with banto's PWA approach. PWA gives this for free without a native app investment.

### Business & Ecosystem Lessons

- **Single-provider focus is fine initially.** Crystal started Claude-only and it worked. banto's "CC only" principle is validated — users who need Crystal/Nimbalyst's multi-provider support are a different audience.
- **Community support requires investment.** Crystal's unanswered GitHub discussions eroded trust (Issue #235: "Project dead?"). If banto goes OSS, either invest in community response or set expectations clearly.

---

## Sources

- [stravu/crystal - GitHub](https://github.com/stravu/crystal) — Crystal source repository (archived)
- [Nimbalyst/nimbalyst - GitHub](https://github.com/Nimbalyst/nimbalyst) — Nimbalyst repository
- [Nimbalyst website](https://nimbalyst.com)
- [Nimbalyst docs](https://docs.nimbalyst.com)
- [HN: Crystal launch thread](https://news.ycombinator.com/item?id=44259353)
- [HN: Nimbalyst discussion](https://news.ycombinator.com/item?id=44324326)
- [Crystal changelog (v0.1.x–v0.3.x)](https://github.com/stravu/crystal/releases) — Referenced for performance fixes, security patches, and feature additions
