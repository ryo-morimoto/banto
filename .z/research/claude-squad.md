# Claude Squad (smtg-ai/claude-squad) Research

Date: 2026-03-07
Sources:
- https://github.com/smtg-ai/claude-squad
- https://news.ycombinator.com/item?id=43575127
- https://news.ycombinator.com/item?id=44630194
- https://dev.to/datadeer/part-2-running-multiple-claude-code-sessions-in-parallel-with-git-worktree-165i
- https://medium.com/@sattyamjain96/i-spent-months-building-the-ultimate-claude-code-setup-heres-what-actually-works-ba72d5e5c07f
- https://dev.to/skeptrune/llm-codegen-go-brrr-parallelization-with-git-worktrees-and-tmux-2gop

Claude Squad is a Go TUI application (6,228 stars, AGPL-3.0) that manages multiple AI coding agent sessions (Claude Code, Aider, Codex, Gemini) by combining tmux for terminal multiplexing, git worktrees for filesystem isolation, and bubbletea for the TUI. Maintained part-time by mufeez-amjad and jayshrivastava. Created 2025-03-09.

---

## Overview

Repository: https://github.com/smtg-ai/claude-squad
Stars: 6,228 | Forks: 426 | Open Issues: 39
Language: Go | Created: 2025-03-09 | License: AGPL-3.0
Maintainers: mufeez-amjad, jayshrivastava (both working full-time jobs, part-time on this)

---

## Architecture

### High-Level Overview

Claude Squad is a Go TUI application built on Charm's bubbletea framework. It manages multiple AI coding agent sessions (Claude Code, Aider, Codex, Gemini) by combining:

- **tmux** for terminal session multiplexing (background execution, capture, attach/detach)
- **git worktree** for filesystem isolation per session
- **bubbletea** for the TUI rendering and event loop

The core data flow is: User creates session via TUI -> git worktree created from HEAD -> tmux session spawned in worktree directory -> agent program launched inside tmux -> TUI polls tmux pane content every 100ms for preview, polls metadata (diff stats, status) every 500ms.

**Takeaway**: The worktree + tmux + TUI triad is the minimum viable architecture for parallel agents. banto replaces worktree with nixos-container (full env isolation) and tmux with PTY + WebSocket (web-native).

### Directory Structure

```
main.go                     # CLI entry (cobra), --program, --autoyes, --daemon flags
cmd/cmd.go                  # Cobra command setup (root, reset, debug, version)
app/
  app.go                    # Bubbletea Model (home struct), Init/Update/View cycle
  help.go                   # Help screen definitions
config/
  config.go                 # JSON config (~/.claude-squad/config.json)
  state.go                  # JSON state persistence (instances, help screen tracking)
session/
  instance.go               # Instance struct - core domain object
  storage.go                # JSON serialization of instances (InstanceData)
  git/
    worktree.go             # GitWorktree struct, constructors
    worktree_ops.go         # Setup, Cleanup, Remove, Prune operations
    worktree_git.go         # CommitChanges, PushChanges, IsDirty, IsBranchCheckedOut
    worktree_branch.go      # Branch name sanitization
    diff.go                 # DiffStats (git diff against base commit)
    util.go                 # findGitRepoRoot, checkGHCLI
  tmux/
    tmux.go                 # TmuxSession: Start, Restore, Attach, Detach, Close
    tmux_unix.go            # Unix-specific terminal size monitoring
    tmux_windows.go         # Windows stubs
    pty.go                  # PtyFactory interface for testability
ui/
  list.go                   # Left panel - session list with status indicators
  preview.go                # Preview pane (tmux capture-pane output)
  diff.go                   # Diff pane (git diff rendered)
  terminal.go               # Direct terminal attach pane
  tabbed_window.go          # Tab container (Preview | Diff | Terminal)
  menu.go                   # Bottom menu bar with key bindings
  err.go                    # Error display bar
  overlay/
    textInput.go            # Prompt input overlay
    textOverlay.go          # Help text overlay
    confirmationOverlay.go  # Confirm modal (kill, push)
keys/
  keys.go                   # Key bindings (vim-style: j/k, plus n/N/D/s/c/r/Enter/?)
daemon/
  daemon.go                 # Background daemon for AutoYes mode
log/
  log.go                    # Logging utilities
web/                        # Next.js marketing site (not part of the TUI)
```

### Key Abstractions

**Instance** (`session/instance.go`): The central domain object representing one agent session.

```
Instance {
  Title, Path, Branch, Status (Running|Ready|Loading|Paused)
  Program string                    // "claude", "aider --model ...", etc.
  AutoYes bool
  Prompt  string
  tmuxSession *tmux.TmuxSession     // initialized on Start()
  gitWorktree *git.GitWorktree      // initialized on Start()
  diffStats   *git.DiffStats
}
```

**TmuxSession** (`session/tmux/tmux.go`): Wraps tmux operations via exec.Command.

- `Start(workDir)`: Creates detached tmux session, runs program, attaches PTY for size control
- `Restore()`: Reattaches PTY to existing tmux session
- `Attach()`: Full-screen takeover with stdin/stdout forwarding, Ctrl+Q to detach
- `CapturePaneContent()`: `tmux capture-pane -p -e -J` for ANSI-preserved output
- `HasUpdated()`: SHA-256 hash comparison of captured pane content
- `CheckAndHandleTrustPrompt()`: Auto-dismiss trust dialogs for Claude/Aider/Gemini

**GitWorktree** (`session/git/worktree*.go`): Manages git worktree lifecycle.

- `Setup()`: Creates worktree from HEAD (new branch `{username}/{session-title}`) or restores from existing branch
- `Cleanup()`: Removes worktree + deletes branch + prunes
- `Remove()`: Removes worktree but keeps branch (for pause)
- `PushChanges()`: git add . -> git commit --no-verify -> git push (uses `gh` CLI)
- `Diff()`: git add -N . -> git diff {baseCommitSHA}

**Storage** (`session/storage.go`): JSON file persistence via config.AppState interface. No database — instances are serialized to `~/.claude-squad/state.json`.

**Takeaway**: The Instance as a single domain object combining session + worktree + agent state is the right granularity. banto's equivalent is a Task + Session pair (task = intent, session = execution).

### Session Lifecycle

```
CREATE:
  1. NewInstance(title, path, program) -> Instance{Status: Ready}
  2. instance.Start(firstTimeSetup=true):
     a. git.NewGitWorktree(path, title) -> creates branch name, worktree path
     b. gitWorktree.Setup() -> `git worktree add -b {branch} {path} HEAD`
     c. tmux.Start(worktreePath) -> `tmux new-session -d -s {name} -c {workdir} {program}`
     d. tmux.Restore() -> opens PTY attached to session for size control
  3. Status -> Running

PREVIEW (every 100ms):
  - tmux capture-pane -> rendered in preview tab

METADATA UPDATE (every 500ms):
  - For each instance:
    - CheckAndHandleTrustPrompt() (auto-dismiss trust dialogs)
    - HasUpdated() via hash comparison of pane content
    - If updated -> Status = Running
    - If not updated and has prompt -> TapEnter() if AutoYes
    - Else -> Status = Ready
    - UpdateDiffStats() -> git diff

ATTACH (Enter key):
  - tmux session goes full-screen
  - stdin/stdout piped directly to PTY
  - Ctrl+Q detaches back to TUI

PAUSE (c key):
  - Commit dirty changes locally
  - DetachSafely from tmux
  - Remove worktree (keep branch)
  - Status -> Paused
  - Branch name copied to clipboard

RESUME (r key):
  - Check branch not checked out elsewhere
  - git worktree add (restore from branch)
  - tmux Restore or Start new session
  - Status -> Running

PUSH (s key):
  - git add . -> git commit --no-verify -> git push -u origin {branch}
  - Opens branch in browser via `gh browse`

KILL (D key):
  - Confirmation modal
  - Delete from storage
  - tmux kill-session
  - git worktree remove + branch -D + prune
```

**Takeaway**: The CREATE/PAUSE/RESUME/PUSH/KILL lifecycle is user-validated. banto should support the same transitions but persist them in SQLite so they survive reboots.

### Daemon Mode

A separate background process (`--daemon` flag) for AutoYes mode when the TUI is not running:

- Launched as a detached child process (PID saved to `~/.claude-squad/daemon.pid`)
- Polls all instances at configurable interval (default 1000ms)
- Auto-accepts prompts by sending Enter to tmux
- Killed when TUI starts, relaunched when TUI exits

**Takeaway**: A daemon for auto-accept is a workaround for lacking event-driven architecture. banto's WebSocket + Agent SDK approach makes this unnecessary — the server is always running.

### TUI Structure (bubbletea)

The `home` struct implements `tea.Model` with states: `stateDefault`, `stateNew`, `statePrompt`, `stateHelp`, `stateConfirm`.

Layout: 30% left (session list) | 70% right (tabbed window: Preview/Diff/Terminal) + bottom menu + error bar.

Key bindings via `keys/keys.go`: vim-style (j/k), plus n (new), N (new with prompt), D (kill), s (push), c (checkout/pause), r (resume), Enter (attach), Tab (switch pane), ? (help).

### Dependencies

- **bubbletea/bubbles/lipgloss**: TUI framework (Charm ecosystem)
- **go-git/v5**: Used minimally (mostly shelling out to git CLI for speed)
- **creack/pty**: PTY allocation for tmux sessions
- **cobra**: CLI framework
- **atotto/clipboard**: Copy branch name on pause
- **External**: tmux (required), gh CLI (required for push), git

### Build System

- Go 1.23+ with toolchain go1.24.1
- goreleaser for multi-platform releases
- Homebrew formula: `brew install claude-squad`
- Install script: `curl -fsSL .../install.sh | bash`
- No database, no server process, pure CLI tool

**Takeaway**: tmux + git + gh の外部依存は最大の技術リスク。banto は nixos-container + Elysia で外部依存をゼロにし、すべてを自前で制御すべき。

### Persistence Model

**No database**. All state is JSON files in `~/.claude-squad/`:

- `config.json`: User preferences (default_program, auto_yes, daemon_poll_interval, branch_prefix)
- `state.json`: Serialized instances array + help screen bitmask
- `worktrees/`: Git worktree directories
- `daemon.pid`: Background daemon PID

Instance state is loaded into memory on startup, saved on quit. This means:
- No concurrent access (single TUI process)
- Data loss on crash (state not saved)
- No query capability on historical sessions
- Reboot kills tmux sessions = sessions unrecoverable (see Issue #212)

**Takeaway**: JSON persistence is the root cause of multiple pain points (data loss, no history, no concurrent access). banto's SQLite choice avoids all of these.

---

## Well-Regarded Features

### Git Worktree Isolation (Most Praised)

The killer feature. Each session gets its own worktree branched from HEAD, so multiple agents can work on the same repo without conflicts.

From HN user cadamsdotcom: *"Claude Squad...manages all the worktrees for you."*

The `c` (checkout) flow is clever: pause commits locally, removes worktree, copies branch name to clipboard so you can review changes in your IDE.

### Simplicity and Quick Setup

One command to install, one command to run. No server, no config required. The TUI is immediately usable.

From the maintainer (mufeez-amjad on HN): *"free and open-source...the most popular+used of these 'claude code multiplexers'"*

### Multi-Agent Support

Not locked to Claude Code. Supports Aider, Codex, Gemini, and any command via `--program`.

### Preview + Diff in TUI

Real-time preview of agent output without switching context. Diff tab shows cumulative changes against the base commit.

### Star Growth (6.2k stars)

The most popular tool in the "AI agent multiplexer" category. Competitors: Conductor (Mac-only), Superset, cmux, gob, happy. Claude Squad leads by a wide margin in stars.

**Why it's popular**: First mover (March 2025), solves a real pain point (parallel agents), minimal setup, and the git worktree pattern is genuinely useful for agent workflows.

---

## Poorly-Regarded Features / Pain Points

### Project Maintenance Concerns (CRITICAL)

**Issue #214** (+16 thumbs up): *"I'm surprised there hasn't been any changes to this repo in a month."*
**Issue #250** (+11): *"Project Seems Abandoned, PR's and bugs are not being accepted or fixed."*

Maintainer response: *"Both Jayant and I are working full time jobs and don't have as much time to commit."* Released v1.0.16 with community fixes.

**Many PRs are unmerged** despite being well-written. The community is actively contributing fixes that are not landing.

### TUI Performance / UI Freezing (CRITICAL)

**Issue #215** (+5): Keystrokes delayed by multiple seconds, session creation blocks UI for ~10s.

**Root cause identified** (Issue #253): `Update()` handler calls `tmux capture-pane`, `git add -N`, `git diff` synchronously on the bubbletea event loop. With N sessions, UI blocks for N * ~100-2600ms per tick.

PR #249 and #253 provide async fixes but remain unmerged.

### "Error capturing pane content: exit status 1" (CRITICAL)

**Issue #216** (+11), #189 (+9), #51 (+6): The most common bug report. tmux capture-pane fails, causing the TUI to freeze or error continuously.

Multiple users across macOS versions, terminal emulators, and install methods. No reliable fix merged.

### AutoYes / YOLO Mode Broken

**Issue #151** (+3): `-y` flag doesn't reliably auto-accept Claude Code prompts. Users resort to workaround: setting `default_program` to `claude --dangerously-skip-permissions`.

The feature relies on string matching tmux pane content for prompt detection, which breaks when Claude Code updates its UI.

**Takeaway**: String matching による状態検知は脆弱。banto は Agent SDK の構造化イベント (tool_use, permission_request, session_end) を使うべき。SDK がイベントを提供しない場合でも、hook + WebSocket で構造化データを送る方がパーシング不要。

### No Persistence Across Reboots

**Issue #212** (+2): Tmux sessions die on reboot. No mechanism to resume sessions. The JSON persistence model stores tmux session references that become invalid.

### Worktree Environment Problems

**Issue #260**: Worktrees miss `node_modules`, `.env`, `.venv`, port configs. Users need 50-100 line setup scripts. No hook mechanism for post-worktree-creation setup.

**Issue #69** (+3): Request to run without git worktrees entirely, because worktrees break project setups.

**Takeaway**: worktree の最大の弱点は環境の不完全な複製 (node_modules, .env, ports)。nixos-container はフル OS 分離なのでこの問題を根本解決する。banto の明確な差別化ポイント。

### Single-Repo Limitation

**Issue #89** (+7): No cross-repository session management. Sessions are tied to the current git repo.

**Issue #239** (+2), #238 (+1): Even basic repo name display in session list is missing.

### Limited Customization

**Issue #121** (+6): No configurable worktree path
**Issue #86** (+9): No configurable worktree location patterns
**Issue #88** (+7): No flexible branch naming templates
**Issue #119** (+5): No customizable key bindings
**Issue #84** (+3): No per-session AI assistant selection
**Issue #182** (+2): No commit message customization
**Issue #245** (+1): No custom config directory support

### HN User Feedback

zanek on HN (comparing to Conductor): *"I just tried Claude Squad this morning, the instructions to use and interface was very clunky. There also was no uninstall instructions or scripts, so I had to write one and uninstall it. Lame"*

### Hard tmux Dependency

The entire architecture is built on tmux:
- Preview works via `tmux capture-pane`
- Status detection via parsing pane content
- Session persistence via tmux sessions
- Attach/detach via tmux PTY

This means:
- No native Windows support (Issue #248)
- Performance bound by tmux subprocess calls
- No Web UI possible without fundamental rearchitecture

### Top Issues by Reaction Count

| Reactions | Issue # | Title | Theme |
|-----------|---------|-------|-------|
| 16 | #214 | No more updates? | Maintenance |
| 11 | #250 | Project Seems Abandoned, PR's and bugs are not being accepted or fixed. | Maintenance |
| 11 | #216 | Error captureing pane content after starting cs | Stability |
| 9 | #189 | TMUX error capturing pane content | Stability |
| 9 | #132 | Bug: Failed to start new session after fresh install | Onboarding |
| 9 | #86 | Support configurable worktree location patterns | Customization |
| 9 | #51 | Error capturing pane content: exit status 1 | Stability |
| 8 | #137 | Diff scrolling broken on Mac default Terminal | UI |
| 7 | #89 | Multi-repository session management | Feature gap |
| 7 | #88 | Support flexible branch naming patterns with templates | Customization |
| 6 | #121 | Add ability to configure the git worktree path | Customization |
| 5 | #215 | TUI Interactions very slow | Performance |
| 5 | #119 | Modify Key Binding for Detach Session Action | Customization |
| 5 | #60 | Support scrolling in the preview pane | UI |
| 4 | #181 | Feature request: Open in IDE | Feature gap |

Top themes: **Stability** (3 issues, 29 reactions), **Maintenance** (2 issues, 27 reactions), **Customization** (4 issues, 27 reactions), **Feature gap** (2 issues, 11 reactions).

---

## User Feedback Summary

### Positive

- **Worktree isolation is the right abstraction** for parallel agent work
- **Simplicity of setup** (one install command, one run command)
- **Free and open-source** vs. Conductor (Mac-only paid app)
- **Multi-agent support** (not locked to Claude)
- **Preview + diff in TUI** gives good situational awareness

### Negative

- **Feels abandoned** (slow PR merges, months without releases)
- **Frequent crashes** (tmux capture-pane errors)
- **UI freezes** (synchronous subprocess calls on event loop)
- **YOLO mode unreliable** (brittle string matching)
- **Worktrees break project setups** (missing deps, env files, ports)
- **No reboot persistence** (tmux sessions lost)
- **Single repo only** (no multi-project management)
- **Clunky UX** (HN feedback)
- **10 instance hard limit** (GlobalInstanceLimit = 10)

### User Quotes (Reddit / HN / Blog)

> "Claude Squad...manages all the worktrees for you."
> — cadamsdotcom, [HN](https://news.ycombinator.com/item?id=43575127)

> "I just tried Claude Squad this morning, the instructions to use and interface was very clunky. There also was no uninstall instructions or scripts, so I had to write one and uninstall it. Lame."
> — zanek, [HN](https://news.ycombinator.com/item?id=44630194) (comparing to Conductor)

> "The mental gymnastics of context switching not only wears me out but makes me wonder how well I'm steering each session."
> — anonymous, [DEV Community](https://dev.to/datadeer/part-2-running-multiple-claude-code-sessions-in-parallel-with-git-worktree-165i) (on parallel worktree sessions)

> "[After months of experimentation,] the essentials include Claude Code itself, a good CLAUDE.md file, GitHub MCP, ccusage for cost awareness, claude-historian-mcp for memory, and Claude Squad for parallelism."
> — Sattyam Jain, [Medium](https://medium.com/@sattyamjain96/i-spent-months-building-the-ultimate-claude-code-setup-heres-what-actually-works-ba72d5e5c07f) (Jan 2026)

> "The jump from single-session Claude Code to a coordinated team feels like the jump from single-threaded to multi-threaded programming."
> — anonymous, [DEV Community](https://dev.to/skeptrune/llm-codegen-go-brrr-parallelization-with-git-worktrees-and-tmux-2gop) (on parallel agent workflows)

---

## Learnings for banto

### What Users Actually Want

**Git worktree isolation is proven.** Users consistently praise this as the core value. banto should provide equivalent isolation (via nixos-containers, which go further by also isolating runtime dependencies, ports, and env files — solving Issue #260 natively).

**Real-time preview of agent output** is essential for the "watch" part of "jot, throw, watch". Poll-based preview (every 100ms) works well enough for TUI; banto with WebSocket can do better with event-driven updates.

**Diff view against base commit** gives users confidence to merge. banto should show cumulative diffs per session.

**Pause/Resume with branch preservation** is useful for long-running sessions. banto's container-based approach should support similar lifecycle.

**Push-to-branch flow** (commit + push + open browser) is the natural endpoint. banto should support this.

**Multi-repository management**: banto's project-based model (projects table) handles this natively, filling a gap (Issue #89, +7 reactions) that Claude Squad cannot address.

**Reboot persistence**: nixos-containers + SQLite state survives reboots. Claude Squad cannot do this (Issue #212).

**Historical sessions**: SQLite query on past sessions, diffs, outcomes. Claude Squad loses all history on kill.

**What Makes Claude Squad Popular Despite Its Problems**:
1. **First mover**: Launched March 2025, established category
2. **Solves a real, frequent pain**: Every Claude Code user wants parallel sessions
3. **Zero-config entry**: One install, one command, works
4. **Git worktrees are the right abstraction** (despite setup issues)
5. **Open source + free** vs. paid alternatives

### Technical Design Lessons

**JSON file persistence is fragile.** No concurrent access, data loss on crash, no queryability. banto's SQLite choice is correct.

**Synchronous subprocess calls on the UI event loop** is the #1 technical debt item. banto must ensure all I/O (container operations, git commands, agent communication) is async from the start.

**String matching for status detection** (checking for "No, and tell Claude what to do differently" in pane output) is extremely brittle. Breaks on every Claude update. banto should use structured APIs (Agent SDK events, exit codes, WebSocket messages) rather than output parsing.

**Status detection (Running/Ready)** helps users know when to act. Claude Squad's approach (hash comparison of output + prompt string matching) is brittle but the concept is right. banto should use structured signals from Claude Agent SDK rather than output parsing.

**Hard dependency on a single multiplexer (tmux)** makes the system inflexible. banto's architecture (containers + PTY + WebSocket) is more portable.

**No database** means no historical sessions, no search, no analytics. banto's sessions + session_events tables are the right approach.

**Daemon for background auto-accept** is a hack. With proper event-driven architecture and WebSocket, banto can handle this in the main process.

**Environment isolation**: nixos-containers provide full env isolation (deps, ports, env files). Solves worktree's biggest pain point (Issue #260).

**Structured agent communication**: Agent SDK events vs. tmux pane scraping.

**Concurrent users**: (not a goal for banto, but the architecture supports it if needed)

### UX Pattern Lessons

**Simplicity of setup matters.** One command to install, one command to run. No server, no config required. The TUI is immediately usable. banto should aim for comparable ease of first use.

**Global instance limit (10) is arbitrary.** banto should handle limits based on system resources.

**Web access from any device**: PWA vs TUI-only. Tablet/phone monitoring while away from desk.

banto's differentiation must be clear: it's not another TUI multiplexer. It's a persistent web dashboard for task-oriented agent management. The "jot task -> throw at agent -> watch results -> review diffs" flow is distinct from Claude Squad's "spawn N terminals and babysit them" approach.

### Business & Ecosystem Lessons

**Maintenance sustainability**: Claude Squad's biggest problem is two part-time maintainers. banto is also a solo project. Plan for this: keep the architecture simple, minimize moving parts, automate testing.

**Feature creep from competitors**: 30+ tools exist in this space (see competitor-tools.md). Stay focused on the core "jot, throw, watch" loop rather than chasing feature parity.

**Worktree/container setup overhead**: Claude Squad's worktree creation takes seconds. nixos-container creation could take longer. Must benchmark and optimize the "throw" latency.

---

## Sources

- https://github.com/smtg-ai/claude-squad
- https://news.ycombinator.com/item?id=43575127
- https://news.ycombinator.com/item?id=44630194
- https://dev.to/datadeer/part-2-running-multiple-claude-code-sessions-in-parallel-with-git-worktree-165i
- https://medium.com/@sattyamjain96/i-spent-months-building-the-ultimate-claude-code-setup-heres-what-actually-works-ba72d5e5c07f
- https://dev.to/skeptrune/llm-codegen-go-brrr-parallelization-with-git-worktrees-and-tmux-2gop
