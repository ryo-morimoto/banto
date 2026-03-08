# OpenCode (anomalyco/opencode) Research

Date: 2026-03-08
Sources:
- https://github.com/anomalyco/opencode
- https://opencode.ai/docs/
- https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/
- https://techfundingnews.com/opencode-the-background-story-on-the-most-popular-open-source-coding-agent-in-the-world/
- https://news.ycombinator.com/item?id=44482504

OpenCode is the most popular open-source AI coding agent (118k stars, MIT license, TypeScript/Zig). Built by Anomaly (formerly SST), it provides a provider-agnostic terminal-first coding agent with client/server architecture, ACP support, and 650k+ MAU. Monetized through OpenCode Zen (pay-as-you-go model gateway) and OpenCode Go/Black subscriptions.

---

## Overview

OpenCode is an open-source AI coding agent built for the terminal. It positions itself as the "open alternative to Claude Code" -- provider-agnostic, fully open source, and extensible.

**Target users**: Individual developers and teams who want a terminal-native coding agent without vendor lock-in. Power users, neovim enthusiasts, and developers who want control over which LLM they use.

**Origin/History**:
- Founded by Jay V (CEO), Frank Wang (CTO), Dax Raad, and Adam Elmore -- the same team behind SST (Serverless Stack), which went through Y Combinator in 2021.
- The original OpenCode was built in Go by Kujtim Hoxha (opencode-ai/opencode) in 2024. A dispute over ownership and direction led to a split in 2025: the original project partnered with Charm and was renamed "Crush", while the SST team forked and rewrote it in TypeScript on Bun.
- Launched June 19, 2025 under sst/opencode, later moved to anomalyco/opencode.
- Reached 50k stars and 650k MAU within 5 months of launch. Now at 118k stars, 798 contributors, 10k+ commits.

**Controversy**: In early 2026, Anthropic discovered OpenCode was spoofing the `claude-code-20250219` beta HTTP header to use Claude Pro/Max OAuth tokens. Anthropic updated their ToS to explicitly block third-party use, and OpenCode removed all Claude OAuth code on Feb 19, 2026.

**Business model**:
- Core tool is free and open source (MIT).
- **OpenCode Zen**: Pay-as-you-go model gateway. Curated, tested models. Transparent pricing at cost + credit card processing fees. Generates "several million dollars in annualized revenue."
- **OpenCode Go**: $10/month subscription for reliable access to open coding models (US/EU/Singapore hosting).
- **OpenCode Black**: $200/month subscription (upcoming) for premium access to OpenAI + Anthropic + open-weight models.
- Also maintains models.dev, "the largest database of AI models."

---

## Architecture

### Client/Server Model

OpenCode uses a decoupled client/server architecture:

- **Server**: JavaScript/Bun HTTP server (Hono framework). Manages sessions, LLM calls, tool execution, and state persistence.
- **Default client**: A Golang TUI binary compiled with OpenTUI (Zig core), embedded within and extracted by the Bun process at startup.
- **Any HTTP client can connect**: mobile apps, web browsers, scripts, other agents. Real-time updates via SSE (Server-Sent Events).
- Sessions persist server-side at `~/.local/share/opencode/storage/`. Sessions survive terminal closure and can be resumed from any client.

This is the key architectural differentiator -- the agent runtime is separate from any specific UI.

### The Agentic Loop

The core execution cycle in `Session.prompt`:

1. User prompt + system prompt + conversation history + available tools are assembled
2. If token usage exceeds 90% of context limit, automatic compaction (LLM summarizes the session)
3. `streamText()` from Vercel AI SDK initiates the LLM call with multi-step tool usage
4. Stream events processed: `tool-call`, `tool-result`, `tool-error`, `text-delta`, `start-step`, `finish-step`
5. Results persist to disk and broadcast via SSE to all connected clients
6. Loop continues until `stopWhen` conditions met (max steps or user stop)

### OpenTUI Framework

OpenCode v1.0+ replaced the original Go/Bubble Tea TUI with OpenTUI:

- **Zig core** with C ABI for cross-platform native performance (sub-millisecond frame times)
- **TypeScript bindings** with React and SolidJS reconcilers
- Flexbox layout (Yoga engine), built-in tree-sitter syntax highlighting
- Rich components: Text, Box, Input, Select, ScrollBox, Code, Diff
- Currently Bun-exclusive; Deno/Node support in progress
- Also powers terminal.shop

### Agent System

Two primary agents + two subagents + hidden system agents:

| Agent | Type | Access | Purpose |
|-------|------|--------|---------|
| Build | Primary | Full (all tools) | Default agent for development |
| Plan | Primary | Read-only (edit/bash require approval) | Analysis, exploration, planning |
| General | Subagent | Broad | Complex searches, multi-step tasks |
| Explore | Subagent | Read-only | Fast codebase exploration |
| Compaction | System (hidden) | - | Auto-summarizes long contexts |
| Title | System (hidden) | - | Auto-generates session titles |
| Summary | System (hidden) | - | Creates session summaries |

Custom agents can be defined in YAML/Markdown with per-agent model, temperature, tools, permissions, and system prompts. Stored in `~/.config/opencode/agents/` (global) or `.opencode/agents/` (per-project).

### Tool System

Built-in tools: Read, Write, Edit, Bash, Glob, Grep, WebFetch, TodoRead, TodoWrite, Task (sub-agent invocation).

Tools defined with Zod schemas. Per-agent tool access control via config:
```json
"permission": {
  "bash": { "*": "ask", "git status": "allow", "sudo *": "deny" },
  "edit": "allow"
}
```

### Protocol Support

**MCP (Model Context Protocol)**: Full support for local (stdio) and remote (HTTP + OAuth 2.0) MCP servers. Configured in `opencode.json` under `mcp`. Variable substitution for secrets. Graceful degradation if servers unavailable. Real-time status in TUI sidebar.

**LSP (Language Server Protocol)**: Native integration. Spawns LSP clients that communicate via JSON-RPC over stdio. Dynamic server selection by file extension. After edits, queries LSP for diagnostics and feeds results back to LLM for self-correction. Automatic venv detection for Python.

**ACP (Agent Client Protocol)**: Full support. `opencode acp` starts an ACP-compatible subprocess communicating via JSON-RPC over stdio (nd-JSON). Supported editors: Zed, JetBrains IDEs, Neovim (via Avante.nvim or CodeCompanion.nvim). Near-full feature parity with TUI (except /undo, /redo).

### LLM Provider Agnosticism

Provider independence via the Vercel AI SDK abstraction layer. Supports 75+ models: Anthropic, OpenAI, Google Gemini, AWS Bedrock, Groq, Azure OpenAI, OpenRouter, Ollama (local), and more. Provider-specific system prompts are crafted per model. Users can specify custom system prompts via `CLAUDE.md` or `AGENTS.md`.

### Session Management

- Each session has a unique ID, persists conversation history, todo lists, file snapshots
- Git-based snapshots at each step start (without altering working history) for safe rollback via `git read-tree` + `checkout-index`
- Auto-compaction at 95% of model context window
- Sessions resumable across restarts and clients
- Cost tracking per session (input/output/reasoning tokens with model-specific pricing)

### Multi-Surface Architecture

The same backend supports:
- **TUI** (default): OpenTUI-based terminal interface
- **Web** (`opencode web`): Local web server, same sessions/state as TUI, Tauri desktop wrapper available
- **Desktop** (Beta): Tauri-based native app wrapping the web interface, with `opencode://` deep links and auto-updates
- **IDE extensions**: VS Code, Cursor, Zed, Windsurf, VSCodium (via ACP or custom integrations)
- **Any HTTP client**: SDK available (`@opencode-ai/sdk`)

---

## Well-Regarded Features

### 1. Provider Agnosticism
Users consistently praise the ability to swap models freely. "I authed it into my Github Copilot account and immediately I was able to start vibing out" (HN: fortyseven). "Switching between Claude and Copilot subscriptions without friction" (HN: graeber_28927). No vendor lock-in is the #1 selling point.

### 2. Terminal-First UX Quality
Described as "A tier TUI. Basically an open Claude code" (HN: scosman). Built by neovim users and terminal.shop creators. Tool calls are clearly formatted, file diffs are readable, progress indicators are non-distracting. The Tab key agent switching between Build/Plan is universally praised.

### 3. Client/Server Architecture Enabling Remote Access
Sessions survive terminal closure. `opencode web` lets you control from a browser. Community projects like Remote-OpenCode (Discord bot) and Gigacode demonstrate the power of this separation. "OpenCode's 'web' command makes your local session run on the browser" (HN).

### 4. Autonomous Agentic Loops
"The feedback loops of say OpenCode writing new tests, running the test suite, seeing the tests errored" impressed users (HN: jeremy_k). The LSP integration feeding diagnostics back to the LLM is a standout -- automatic self-correction after edits.

### 5. ACP Support
Being an ACP provider means OpenCode works in JetBrains, Zed, Neovim, and Emacs without custom integrations. This is a significant ecosystem advantage.

### 6. Extensibility via Custom Agents and MCP
Custom agent definitions (YAML/Markdown), custom commands, MCP server integration, and the SDK/API enable deep customization. "Works out of the box" but scales to complex setups.

### 7. Cost Transparency
Per-session cost tracking with model-specific pricing data. Zen's at-cost pricing with transparent processing fees. Users appreciate knowing exactly what they spend.

### 8. Open Source with Active Community
118k stars, 798 contributors, MIT license. Rapid iteration -- v1.2.21 as of March 2026. Active Discord. 21 language localizations.

---

## Poorly-Regarded Features / Pain Points

### 1. Git Abuse / Snapshot System
Issue #3176: OpenCode's snapshot system runs `git add .` without checking directory size, causing massive slowdowns, CPU spikes, and system instability for data science workspaces with large datasets. No size limits or exclusion patterns.

### 2. Context Window Opacity
Users report context degradation -- repeated "oldString not found" errors near 100k tokens (HN: gwd). No clear visibility into how much context remains. Auto-compaction at 95% is hardcoded and not configurable.

### 3. Permission System Default-Allow is Unsafe
Issue #5076: Default permission is "allow" (auto-approve without prompting). Combined with bash access from any model, this is "logically equivalent to installing an auto-updating remote access tool." No sandbox -- permissions are UX only, not security boundaries.

### 4. Provider Integration Instability
Issue #14716: OpenRouter became "neigh-on unusable" due to `thinking`/`redacted_thinking` blocks being modified. Provider-specific bugs break entire workflows. The OAuth/Anthropic controversy showed fragility of third-party model access.

### 5. Unbounded Memory Growth
PR #16346: Active usage causes unbounded memory growth. A significant performance bug being addressed as of March 2026.

### 6. Configuration Fragmentation
"All of them have slightly different conventions for where to put skills, how to format MCP servers... it's a big mess for anyone trying to have a portable config" (HN: outlore). Multiple config files (opencode.json, tui.json, AGENTS.md) across multiple locations.

### 7. Fork Controversy / Identity Confusion
The split between opencode-ai/opencode (original Go version by Kujtim Hoxha) and anomalyco/opencode (TypeScript rewrite) created "significant community confusion" (HN: preciz, theli0nheart). The Anthropic OAuth spoofing incident damaged trust.

### 8. Claude May Perform Better in Native Harness
"You can't shake off the feeling that maybe Claude would perform better in its native harness compared to VSCode/OpenCode" (HN). Suspicion that Anthropic embeds undisclosed capabilities in Claude Code's binary.

### Top Issues by Reaction Count

| Reactions | Issue # | Title | Theme |
|-----------|---------|-------|-------|
| High | #7410 | Broken Claude Max | Provider integration |
| High | #2072 | Support for Cursor? | Editor integration |
| High | #12954 | 5.3 Codex for GitHub Copilot provider | Model support |
| High | #3844 | Plan mode questions like Claude Code | Feature parity |
| High | #631 | Windows Support | Platform support |
| High | #1764 | Vim motions in input box | TUI usability |
| High | #4695 | Speech-to-Text Voice Input | Accessibility |
| High | #1543 | Adding directories / creating workspaces | Project management |
| High | #8501 | Allow to expand pasted text | TUI usability |
| High | #12661 | Add Agent Teams equivalent or better | Multi-agent |

Note: Exact reaction counts were not available from the GitHub listing. Issues are ordered by approximate popularity based on sort order.

---

## User Feedback Summary

### Hacker News

**Positive**:
- "A tier TUI. Basically an open Claude code." (scosman)
- "I authed it into my Github Copilot account and immediately I was able to start vibing out." (fortyseven)
- "Great as a full replacement. Works out of the box." (anonymous, item #47045200)
- "The feedback loops of OpenCode writing new tests, running the test suite, seeing the tests errored [are impressive]." (jeremy_k)

**Critical**:
- "Can't shake off the feeling that maybe Claude would perform better in its native harness." (item #47205053)
- Repeated "oldString not found" errors near 100k tokens suggest context management limitations. (gwd)
- Missing permission prompts before write commands noted. (rw_panic0_0)
- Terminal UI called "step backward" by some. (jappgar)
- "All of them have slightly different conventions for where to put skills... it's a big mess." (outlore)

**Comparative**:
- Some prefer aider with vim for separation between editing and AI suggestions. (JeremyNT, jspdown)
- tmux + lazygit recommended for superior diff viewing. (flowingfocus)
- OpenCode's "agentic" autonomous behavior contrasted with aider's permission-based approach. (gwd)

### GitHub Issues

- Git snapshot abuse causing system instability (#3176)
- OpenRouter provider errors making tool unusable (#14716)
- "Bugs still happen from 1.1.52 to 1.1.58 NEVER FIX!!!!!" -- frustrated user indicating unresolved persistent bugs
- Unbounded memory growth during active usage (PR #16346)
- Security-minded defaults requested (#5076)
- Sandboxing proposals for isolated execution (#12674)
- YOLO mode (auto-approve all) requested (#11831) -- showing split between security-conscious and speed-focused users

### Blog Posts / Reviews

- "OpenCode feels like it's built by terminal lovers, for terminal lovers." (DEV Community)
- "With 95K+ GitHub stars in its first year, surpassing Claude Code in star count." (morphllm.com)
- "Claude Code completes tasks approximately 45% faster. However, OpenCode generates roughly 29% more tests." (morphllm.com comparison)
- "OpenCode is not an AI product. It's a product designed to use AI." (Jay V, TechFundingNews)
- "Documentation could be more comprehensive, some features are still experimental." (Medium)

---

## Learnings for banto

### What Users Actually Want

- **Provider flexibility is non-negotiable**: Users resent being locked to one provider. OpenCode's 118k stars vs Claude Code's 71k stars show the demand. banto should treat provider-agnosticism as a core principle, which aligns with the current "best interface per agent" approach.
- **Session persistence across devices**: OpenCode's client/server split enabling mobile/web/terminal access to the same session is its killer feature. banto already targets this (web dashboard), but should ensure sessions are truly device-agnostic.
- **Cost visibility per task**: Users want to know what each task costs. banto should surface per-task and per-session cost data prominently.
- **Agent Teams / multi-agent**: Issue #12661 shows demand for coordinated multi-agent workflows. banto's multi-agent dashboard is directly addressing this gap.
- **Plan-first workflow**: The Plan/Build mode split is universally praised. banto should consider surfacing agent mode (read-only exploration vs. active development) in the dashboard.

### Technical Design Lessons

- **Client/server separation is the right architecture**: OpenCode proved that decoupling the agent runtime from the UI enables an entire ecosystem (web, mobile, IDE, Discord bots). banto's architecture should similarly treat the backend as an API-first service.
- **ACP is becoming a real standard**: OpenCode, JetBrains, Zed, and Neovim all support ACP. banto's ACP-as-universal-fallback strategy is validated. ACP uses JSON-RPC over stdio (nd-JSON), same as LSP.
- **LSP integration for self-correction is high-value**: Feeding LSP diagnostics back to the LLM after edits is one of OpenCode's most praised features. banto should consider whether to expose LSP diagnostic data in the dashboard for observability.
- **Git-based snapshots have sharp edges**: OpenCode's `git add .` approach breaks on large repos. Any snapshot/rollback system needs size-aware heuristics and respect for .gitignore-like exclusions.
- **Auto-compaction needs to be configurable**: Hardcoded 95% threshold is a pain point. banto should let users configure compaction behavior per-agent.
- **Event bus + SSE for real-time**: OpenCode's architecture of persisting to disk then broadcasting via SSE is simple and effective. banto's WebSocket approach is similar but bidirectional.

### UX Pattern Lessons

- **Tab to switch agents is brilliant UX**: Minimal cognitive overhead. banto's dashboard equivalent should make switching between task views equally frictionless.
- **@ for file references, ! for shell commands**: These interaction shortcuts are now expected in coding agent TUIs. banto should document the native shortcuts of each agent rather than reinventing them.
- **Show, don't hide tool execution**: OpenCode's `/details` toggle (ctrl+x d) for tool execution visibility is valued. banto's dashboard should default to showing what agents are doing, with the ability to collapse detail.
- **Diff readability matters enormously**: One of the most commented-on aspects across all reviews. banto should invest in readable diff rendering in the dashboard.
- **Multiple surfaces from one backend**: TUI + Web + Desktop + IDE from the same server. banto is already web-first, but the lesson is that the API should be rich enough to support future surfaces.

### Business & Ecosystem Lessons

- **Open source + model gateway is a viable business**: OpenCode is free but monetizes through Zen/Go/Black model gateway subscriptions. "Several million dollars in annualized revenue" from 650k MAU. This validates that developer tools can be free if the model access layer monetizes.
- **Provider relationships are fragile**: The Anthropic OAuth controversy shows that relying on unofficial API access is risky. banto should only use documented, stable APIs for each agent.
- **Community momentum compounds**: 118k stars and 798 contributors create a flywheel. Third-party tools (Remote-OpenCode, Gigacode, OpenChamber, opencode-viewer) emerge organically. banto should design its API to be extensible enough for community tools.
- **Fork drama destroys trust**: The opencode-ai vs anomalyco split and the Anthropic spoofing incident damaged OpenCode's reputation with some users. Transparency about project governance matters.
- **Speed of iteration wins**: v1.2.21 with 10k+ commits shows aggressive iteration. The tool "is still maturing, but the community momentum suggests it will be a serious contender." banto should prioritize rapid, visible progress over perfection.

---

## Sources

- https://github.com/anomalyco/opencode -- Main repository (118k stars, MIT, TypeScript/Zig)
- https://opencode.ai/docs/ -- Official documentation
- https://opencode.ai/docs/agents/ -- Agent system documentation
- https://opencode.ai/docs/acp/ -- ACP support documentation
- https://opencode.ai/docs/tui/ -- TUI interface documentation
- https://opencode.ai/docs/mcp-servers/ -- MCP configuration documentation
- https://opencode.ai/docs/zen/ -- Zen pricing model
- https://opencode.ai/docs/web/ -- Web interface documentation
- https://cefboud.com/posts/coding-agents-internals-opencode-deepdive/ -- Deep technical architecture analysis by Moncef Abboud
- https://techfundingnews.com/opencode-the-background-story-on-the-most-popular-open-source-coding-agent-in-the-world/ -- Business/founder background story
- https://news.ycombinator.com/item?id=44482504 -- HN launch thread (July 2025)
- https://news.ycombinator.com/item?id=47205053 -- HN comparison thread (March 2026)
- https://news.ycombinator.com/item?id=46912682 -- Gigacode (OpenCode protocol) HN thread
- https://www.morphllm.com/comparisons/opencode-vs-claude-code -- OpenCode vs Claude Code detailed comparison
- https://www.shareuhack.com/en/posts/opencode-anthropic-legal-controversy-2026 -- Anthropic OAuth controversy
- https://github.com/anomalyco/opencode/issues/3176 -- Git abuse issue
- https://github.com/anomalyco/opencode/issues/5076 -- Security defaults issue
- https://github.com/anomalyco/opencode/issues/14716 -- OpenRouter provider error issue
- https://github.com/anomalyco/opentui -- OpenTUI framework repository
- https://deepwiki.com/anomalyco/opencode/6.2-permission-system -- Permission system documentation
- https://dev.to/wonderlab/open-source-project-of-the-day-part-4-opencode-a-powerful-ai-coding-agent-built-for-the-g05 -- DEV Community review
