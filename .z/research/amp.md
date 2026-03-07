# Amp (Sourcegraph) Research

Date: 2026-03-07
Sources:
- https://ampcode.com
- https://news.ycombinator.com
- https://substack.com
- https://medium.com
- https://sourcegraph.com/blog
- https://community.sourcegraph.com

Amp is an agentic AI coding tool originally built by Sourcegraph, now spinning out as an independent company (Amp Inc., effective Dec 2, 2025). It positions itself as a "frontier coding agent" — not a copilot or autocomplete tool, but an autonomous agent built from scratch for agentic workflows. Quinn Slack (Sourcegraph co-founder/CEO) leads Amp Inc. Amp claims to be already profitable.

---

## Overview

Amp is built on Sourcegraph's code intelligence/search infrastructure and targets frontier developers who want to be "a year ahead."

- **Origin**: Built within Sourcegraph, leveraging their code intelligence/search infrastructure.
- **Spin-out**: Became Amp Inc. (Dec 2, 2025). Independent research lab.
- **Leadership**: Quinn Slack (CEO), Beyang Liu, 20 co-founders from Sourcegraph.
- **Investors**: Craft, Redpoint, Sequoia, Goldcrest, a16z on boards of both companies.
- **Financials**: Already profitable. Sourcegraph had raised $200M+ at $2.6B valuation.
- **Rationale**: Different distribution engines and target audiences. Sourcegraph = enterprise infrastructure. Amp = frontier developers who want to be "a year ahead."

---

## Architecture

### Three Surfaces

1. **CLI** — `@sourcegraph/amp` npm package. Auto-updates via Bun. Primary interface for power users and parallelized workflows. Supports `--stream-json` for programmatic integration.
2. **IDE Extensions** — VS Code (and forks: Cursor, Windsurf, VSCodium), JetBrains (via CLI integration), Neovim, Zed.
3. **Web UI** — ampcode.com/threads. Thread viewer, workspace management, sharing. Not a full coding environment — serves as the persistence/collaboration layer.

**Note (Feb 2026):** Amp announced it is discontinuing editor extensions to focus on the CLI + web model, declaring "the coding agent is dead" in its editor-extension form. The team believes modern models no longer need the scaffolding that editor extensions provide.

### Client-Server Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌──────────────┐
│  Amp Client  │────▶│   Amp Server    │────▶│ LLM Providers│
│ (CLI / IDE)  │◀────│ (ampcode.com)   │◀────│ (Anthropic,  │
│              │     │  GCP / Postgres │     │  OpenAI, etc)│
└─────────────┘     └─────────────────┘     └──────────────┘
```

- **Amp Client**: Local tool handling UI, code management, context collection. Does NOT clone/index the entire codebase. Sends contextual snippets + prompts to server.
- **Amp Server**: Multi-tenant cloud service on Google Cloud Platform. Manages auth, workspaces, thread storage (PostgreSQL), LLM proxying. All data encrypted at rest (AES-256) and in transit (TLS 1.2+).
- **LLM Providers**: Anthropic, OpenAI, xAI, Google Vertex AI, Amazon Bedrock, Fireworks, Baseten — all US-based.

The client collects local context, sends it to Amp Server, which forwards to LLM providers and stores thread data. The server acts as a persistent store and proxy, never holding the full codebase.

### Thread System (Cross-Device Core)

Threads are the fundamental unit — a single conversation between user and agent with all messages, context, and tool calls persisted. Key characteristics:

- **Server-stored**: All threads stored in PostgreSQL on GCP. Accessible at ampcode.com/threads.
- **Cross-device sync**: CLI and IDE extensions access the same thread data via the server. Start a thread on one machine, continue on another.
- **Thread commands**: `amp threads new`, `amp threads continue [id]`, `amp threads list`, `amp threads fork [id]`, `amp threads share [id]`, `amp threads compact [id]`.
- **Thread references**: Threads can be referenced via URL or @-mention syntax (`@T-7f395a45-...`) to extract context into the current thread.
- **Thread search**: Amp can search past threads (yours and workspace members') by keyword, file path, repo, author, date, or task.
- **Compact thread**: Summarizes existing conversation to reduce token usage while preserving context. Alternative: "New Thread with Summary" for a fresh start.

**Visibility levels:**
- Private (only you)
- Group-shared (Enterprise only — specific groups)
- Workspace-shared (all workspace members)
- Unlisted (anyone with the link)
- Public (on your public profile, searchable)

Per-repository default visibility can be configured via mappings.

**Data retention:**
- Enterprise: Zero data retention for text inputs on LLM providers
- Non-Enterprise: Standard retention
- Deleted threads: Purged within 30 days
- User deletion: Workspace threads remain; personal threads deleted

### Context Management

- Claude Opus 4.6 gets up to 200K tokens of context; Claude Sonnet 4 supports up to 1M tokens.
- `AGENTS.md` files (in cwd, parent directories, subtrees, `$HOME/.config/amp/AGENTS.md`) are always included as guidance.
- Subtree-specific guidance via YAML frontmatter with `globs` for language-specific rules.
- Strategy: "max out" the context window with as much information as possible.
- Recommendation: Abandon noisy threads and start fresh rather than trying to salvage them.

### Agent Modes

- **Smart**: State-of-the-art models (Opus 4.6) without constraints. Default mode.
- **Rush**: Faster, cheaper, less capable. For small, well-defined tasks.
- **Deep**: Deep reasoning with GPT-5.3-Codex for extended thinking on complex problems. Works autonomously for longer periods.
- **Free**: Ad-supported tier using $10/day credits. Requires data sharing for model training.

### Sub-Agents / Task Tool

Amp can spawn sub-agents for parallel execution via the Task tool:

- Sub-agents operate in **complete isolation** — no communication between them, no access to parent thread's accumulated context.
- User **cannot guide sub-agents mid-task**.
- Parent agent receives only the **final summary**, not step-by-step progress.
- Best for: independent parallel tasks, operations with extensive output, keeping main thread context clean.
- Amp may spawn sub-agents automatically or on user request.

**Specialized sub-agents:**
- **Oracle**: "Second opinion" model (GPT-5.4) for complex reasoning. Slower, more expensive.
- **Librarian**: Searches and analyzes external libraries.
- **Deep Search**: Sourcegraph's agentic search across large codebases via MCP.
- **Review Agent**: Specialized code review using Gemini 3 Pro with a review-oriented toolset.
- **Painter**: Image generation tool.

### Skills Framework

Modular instruction system (Dec 2025) replacing custom commands. Supports lazy-loaded tool definitions to reduce context overhead. Skills can bundle MCP servers via `mcp.json` files.

### Permission System

Tool invocations check against user-defined permissions. Built-in allowlists for common commands (git, npm, cargo). Supports delegation to external permission helpers via environment variables.

### Secret Redaction

Automatic detection and redaction of secrets before transmission. Secrets replaced with `[REDACTED:amp]` markers. Covers AWS, cloud providers, development platforms, common service tokens.

---

## Well-Regarded Features

### 1. Cross-Device Thread Continuity
The most frequently praised feature. Server-stored threads with seamless sync across CLI, IDE, and web. Users can start work on a desktop, review on a laptop, continue on another machine. Thread search and referencing add significant value.

### 2. Sub-Agent Parallelism
Ability to spawn multiple sub-agents for parallel work. The Task tool enables breaking complex work into independent streams. The Oracle "second opinion" model is valued for complex reasoning.

### 3. Multi-Model Strategy
Dynamic model allocation — using Claude, GPT, Gemini for what each is best at. No lock-in to a single model provider. Users appreciate that someone smart evaluates the best fit per task.

### 4. Unconstrained Token Usage
No artificial limits on token consumption. The agent uses whatever it needs to complete the task. Users report this leads to more complete results compared to tools with token budgets.

### 5. CLI-First Design
The CLI is highly regarded. Glen Maddern (Cloudflare Principal Systems Engineer): "Use the CLI version imo, it's the first thing I've tried that beats Claude Code." Effective for parallelizing lightweight tasks.

### 6. Team/Workspace Visibility
Shared workspaces where team members' threads are visible by default. Enables seeing how others use the tool, what code changes they're making, and linking to teammates' threads for context handoff.

### 7. Agentic Code Review
Separate review agent analyzing diffs with structured feedback. Decoupled from traditional diff-reading to enable parallel review workflows. Uses review-oriented toolset.

### 8. Context Quality
Sourcegraph's code intelligence heritage shows in context management. "Better search and context management under the hood, which matters for big companies." Data suggests Sourcegraph produces the most accepted code (per The Information).

### 9. AGENTS.md / Guidance System
Project-specific and subtree-specific guidance with glob-based matching. Allows fine-grained control over how the agent behaves in different parts of the codebase.

---

## Poorly-Regarded Features / Pain Points

### 1. Cost / Pricing Anxiety
The most consistent criticism. Usage-based pricing creates anxiety:
- Users report spending $5, then $10, then $20 in single sessions that "went by so fast."
- Teams report spending >$1000/month per developer.
- Opus is ~40% more expensive than Gemini 3 Pro for equivalent tasks.
- Enterprise pricing is 50% more expensive than individual/team plans.
- Users prefer predictable monthly subscriptions (like Claude Pro at $20/month) over metered usage.

### 2. Server-Side Thread Storage (No Local-First Option)
All threads automatically stored on Sourcegraph servers. No local-first alternative (e.g., `.threads` directory). Problematic for:
- Regulated / high-trust environments
- Users who want to version-control, audit, or gitignore conversations
- Privacy-conscious developers

### 3. Free Tier Data Training
Amp Free requires data sharing for model training. Code and conversations are used to train AI models. This is a hard blocker for anyone working with proprietary code.

### 4. Sub-Agent Limitations
Sub-agents are isolated by design, which limits their utility:
- Cannot communicate with each other
- Cannot be guided mid-task
- Start without parent thread context
- Parent only receives final summary (no progress monitoring)

### 5. Leaderboards / Vanity Metrics
Thread sharing and leaderboards seen as "completely out of place in professional settings." Risks incentivizing wrong behaviors (lines of code, number of prompts). Contradicts engineering measurement frameworks (DORA, SPACE, DevEx).

### 6. Thread Stability
Users on the Sourcegraph community forum reported threads being "dropped or removed suddenly." When the Amp plugin restarts unexpectedly, the entire thread being worked on can be lost.

### 7. Frontend Polish
Even fans note: "it needs some frontend polishing, but the core functionality is too good." The web UI and IDE extension lag behind the CLI in quality.

### 8. Model Rollout Instability
Gemini 3 rollout created frustrating experiences. Amp's own team acknowledged: "its impressive highs came with lows. What we internally experienced as rough edges turned into some very frustrating behaviors for our users."

### 9. No Moat Concern
HN commenters argue "There is no moat. It's all prompts." Competitors like Claude Code and Codex offer comparable results at lower costs, making Amp's premium pricing harder to justify.

### 10. Editor Extension Discontinuation
Amp is killing its editor extension to focus on CLI + web. This alienates users who prefer integrated IDE experiences and represents a bet that may not pay off.

---

## User Feedback Summary

**Positive:**
- "We keep trying CC, Cursor Agent, etc. and keep coming back to Amp. It's built different." — Evan Owen
- "Use the CLI version imo, it's the first thing I've tried that beats Claude Code." — Glen Maddern (Cloudflare)
- "Ampcode is too smart and fast!!! Sure, it needs some frontend polishing, but the core functionality is too good!!"
- "I love AMP, it delivers great results. I like that it's opinionated in how it should be used."
- "Amp is still on top" among competing tools (HN commenter, noting higher cost)

**Negative:**
- Cost anxiety: spending tens of dollars per day during trial, feeling anxious about every interaction costing money
- Thread loss: plugin restarts causing entire threads to disappear
- "There is no moat. It's all prompts." — skeptics on HN
- Privacy concerns about server-stored threads and free tier data training

---

## Learnings for banto

### What Users Actually Want

- **Cross-device thread continuity is proven.** Amp's most praised feature validates banto's session-centric approach. Key implementation insight: the server stores all thread data (messages, tool calls, context) and both CLI and web clients are thin layers that read/write to the same server-stored state. For banto: sessions stored in SQLite with WebSocket-pushed updates is the right pattern. The thread/session is the atomic unit of cross-device continuity.

- **Thread search and cross-reference is high value.** Amp's ability to search across past threads and reference other threads from the current one is a highly valued feature. For banto: consider making sessions searchable and allowing cross-referencing between sessions. This enables "what did I do last time I touched this code?" workflows.

- **Cost transparency matters.** Amp's usage-based pricing creates significant anxiety. banto uses the user's own API keys/Claude subscription, so cost is more transparent and predictable. Consider surfacing token usage per session in the dashboard so the user has visibility.

- **Real-time agent visibility over final summaries.** Amp's sub-agents cannot communicate, cannot be guided mid-task, and only return a final summary. Users find this limiting. For banto: if/when implementing multi-agent features, consider allowing the dashboard to show sub-agent progress in real-time (not just final summary) and enabling user intervention mid-task. This aligns with banto's "watch" principle — you should be able to see what every agent is doing.

### Technical Design Lessons

- **Server-side storage is a double-edged sword.** Amp's cloud-only thread storage is a major pain point for privacy-conscious users. banto has an advantage here: running on a local NixOS mini PC means all data stays on the user's own hardware. This is a genuine differentiator versus Amp for solo developers who care about privacy. Lean into this.

- **Context quality from code intelligence.** Sourcegraph's heritage in code search/intelligence gives Amp superior context management. banto won't have this advantage, but can compensate by leveraging Claude Code's built-in file search and context management, storing CLAUDE.md / AGENTS.md guidance per project, and letting users pre-configure context per task.

### UX Pattern Lessons

- **CLI-first works.** Amp's CLI is more praised than its IDE extension. The team is even dropping the IDE extension. This suggests that for agent tools, the CLI/terminal is the natural interface. banto's approach of spawning Claude in interactive TUI mode and embedding a terminal viewer is aligned with this trend.

- **Agentic code review is a differentiator.** Amp's separate review agent for analyzing diffs is well-received. For banto: the "review" phase of a task (after the agent completes work) is where banto's value proposition is strongest. Consider first-class support for reviewing agent output — diffs, summaries, test results.

- **Leaderboards and social features are divisive.** Amp's leaderboards and thread sharing to public profiles are criticized as misguided for professional settings. banto targets a single developer, so social/competitive features are irrelevant. Focus on personal productivity visibility, not team metrics.

### Business & Ecosystem Lessons

- **Killing the editor extension is bold.** Amp betting on CLI + web (dropping IDE extensions) is a strong signal that the industry is moving toward agent-as-process rather than agent-as-plugin. banto's architecture (web dashboard + spawned agent processes) is naturally aligned with this direction.

---

## Sources

- https://ampcode.com — Official site, documentation, pricing
- https://ampcode.com/blog — Blog posts including "The Coding Agent is Dead" (editor extension discontinuation), Gemini 3 rollout retrospective
- https://ampcode.com/docs/security — Security and data handling documentation
- https://ampcode.com/docs/threads — Thread system documentation
- https://ampcode.com/docs/sub-agents — Sub-agent / Task tool documentation
- https://sourcegraph.com/blog/amp-sourcegraph — Spin-out announcement (Dec 2025)
- https://community.sourcegraph.com — Sourcegraph community forum (thread loss reports, user feedback)
- https://news.ycombinator.com — HN discussions on Amp launch, "no moat" debate, CLI praise (Glen Maddern / Cloudflare)
- https://medium.com — User experience reports, cost analysis articles
- https://substack.com — Developer evaluations, Evan Owen testimonial
