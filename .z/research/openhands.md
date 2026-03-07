# OpenHands (All-Hands-AI) Research

Date: 2026-03-07
Sources:
- https://github.com/All-Hands-AI/OpenHands

Open-source AI-driven software development platform. Formerly OpenDevin. MIT-licensed core with enterprise add-ons. 68.7k GitHub stars, 482 contributors.

---

## Overview

OpenHands is the leading open-source autonomous coding agent platform. It provides an LLM with a full working environment (terminal, file system, editor, browser) and lets it plan and execute multi-step software development tasks. The platform spans CLI, local GUI, cloud SaaS, and enterprise self-hosted deployments.

Key numbers (as of early 2026):
- 68.7k GitHub stars
- 77.6 SWE-Bench score (with Claude Sonnet 4.5)
- ~20% of OpenHands' own commits authored/co-authored by OpenHands agents
- v1.4.0 released Feb 2026 (V1 line started Dec 2025)

---

## Architecture

### V0 to V1 Evolution

V0 was monolithic and sandbox-centric. All executions required Docker containers, agent logic was coupled to evaluation code, and tool implementations were duplicated across execution paths.

V1 refactored into four independent packages:
1. **SDK Core** - Agent definition, conversation management, event-sourced state
2. **Tools** - TerminalTool, FileEditorTool, TaskTrackerTool, MCP integration
3. **Workspace** - Abstraction over local filesystem vs. remote containers
4. **Agent Server** - REST/WebSocket server for remote execution

### Four Design Principles (V1)

1. **Optional isolation** - Local execution by default; sandboxing opt-in
2. **Stateless components, single source of truth** - All config immutable at construction; only ConversationState is mutable
3. **Strict separation of concerns** - Agent core decoupled from applications (CLI, Web UI, GitHub)
4. **Two-layer composability** - Independent deployment packages + typed component extension

### Interfaces

| Interface | Description |
|-----------|-------------|
| **CLI** | Terminal experience similar to Claude Code. Multiple LLM backends. |
| **Local GUI** | REST API + React SPA. Similar to Devin/Jules. |
| **Cloud (app.all-hands.dev)** | Hosted SaaS with free tier (Minimax model). Slack/Jira/Linear integrations. Multi-user RBAC. |
| **Enterprise** | Self-hosted via Kubernetes in private VPC. Source-available Helm Chart. 30-day free trial. |

### Software Agent SDK

Python + REST APIs for building agents. Core primitives:

```python
agent = Agent(llm=llm, tools=[TerminalTool(), FileEditorTool(), ...])
conversation = Conversation(agent=agent, workspace=LocalWorkspace(cwd))
conversation.send_message("Fix the failing tests")
conversation.run()
```

Key design choices:
- **Event-sourced state** - All interactions are append-only events. ConversationState is the sole mutable entity. Enables deterministic replay, session recovery, resume from last event.
- **Action-Execution-Observation pattern** - Input validated via Pydantic, executor runs logic, structured output returned to LLM.
- **Workspace abstraction** - Same agent code runs locally or in Docker/K8s containers. Switching requires only changing workspace instantiation.
- **MCP integration** - MCP tools treated as first-class SDK tools. JSON Schema from MCP servers auto-converts to Action models.
- **100+ LLM support** via LiteLLM abstraction. Model-agnostic by design.

#### Workspace Abstraction Pattern

```python
# Same agent code, different workspace
from openhands.sdk import Agent, Conversation
from openhands.workspace import LocalWorkspace, DockerWorkspace

agent = Agent(llm=llm, tools=[TerminalTool(), FileEditorTool()])

# Local execution
conv = Conversation(agent=agent, workspace=LocalWorkspace(cwd="/project"))

# Container execution — same agent, isolated environment
conv = Conversation(agent=agent, workspace=DockerWorkspace(image="oh-sandbox"))
```

**Takeaway for banto**: A similar pattern (LocalWorkspace vs. ContainerWorkspace) would allow testing sessions locally while deploying in NixOS containers.

#### Event-Sourced State Flow

```
User sends message
  → MessageAction (append to event log)
  → Agent processes (LLM call)
  → ToolAction (append)
  → Executor runs tool
  → ToolObservation (append)
  → Agent continues or finishes
  → ConversationState updated (sole mutable entity)

Replay: re-apply all events → identical state
Resume: load from last event → continue
```

**Takeaway for banto**: banto's `session_events` table should follow the same append-only pattern. State is derived, never stored directly.

### Agent Server

Client-server architecture for remote execution:
- RemoteConversation serializes agent config as JSON
- Agent Server (Docker) reconstructs agent, streams events via WebSocket
- Interactive workspace access: VNC desktop, VSCode Web, Chromium browser
- Enables multi-tenant deployments with per-container workspace isolation

### Tech Stack

- Python 76%, TypeScript 21.9%
- Docker-based sandboxing
- LiteLLM for multi-model routing
- React SPA for GUI
- Kubernetes for enterprise deployment

---

## Well-Regarded Features

### 1. Software Agent SDK

The most differentiating feature. No other major agent platform (Claude Code, Cursor, Copilot) offers a composable SDK for programmatic agent construction.

- Define agents in code, run locally or at scale
- Event-sourced state enables pause/resume, replay, recovery
- Sub-agent delegation built in
- Skills system (.agents/skills directory) for reusable capabilities

Compared to competing SDKs (OpenAI Agents SDK, Claude Agent SDK, Google ADK), OpenHands uniquely provides: native remote execution with sandboxing, production REST/WebSocket server, model-agnostic multi-LLM routing, and built-in security analysis.

### 2. Model Agnosticism

Works with Claude, GPT, Gemini, and open-weight models. This is a major advantage over vendor-locked tools. Users can:
- Switch models per task (architecture planning vs. implementation vs. review)
- Use local models for privacy-sensitive work
- Optimize cost by using cheaper models for simpler tasks

OpenHands LM 32B (their own open model) achieves 37.2% on SWE-Bench Verified, runnable on a single 3090 GPU.

### 3. Self-Hosted Option

Kubernetes-based deployment in private VPC. Source-available Helm Chart. Companies retain full control over models and data.

This directly addresses the privacy/regulatory concerns that block adoption of cloud-only tools in government, healthcare, and finance.

### 4. CI/CD Integration

GitHub resolver: autonomous issue-fixing agent that runs in CI. Can auto-create PRs for issues. Linear, Jira, Slack integrations for the cloud offering.

### 5. Stability

In comparative testing (OpenHands vs. Cline vs. Goose), OpenHands was rated the most stable: "No crashes, loops, unrecoverable sessions or getting stuck." Successfully completed tasks within a $10 budget where competitors failed.

### 6. Sandbox/Workspace Isolation

Each agent runs in an isolated container. Prevents filesystem contamination between tasks. The workspace abstraction makes local-to-remote transition seamless.

### 7. Event Condensation

Reduces API costs up to 2x without performance degradation by condensing event history sent to the LLM.

---

## Poorly-Regarded Features / Pain Points

### 1. Cost Explosion

The most consistent complaint. Real-world reports:
- "$30 melted away in about an hour" using Claude Sonnet 3.7
- ~$0.4 per request average
- One user concluded Devin's $500/month is "actually quite inexpensive" compared to OpenHands API costs
- Infrastructure costs (compute, load balancing) are additional

Cost is fundamentally tied to using frontier models, which OpenHands requires for good results.

### 2. Poor Performance with Local/Small Models

"Attempts with llama3.1, codegemma, or deepseek-coder were very disappointing -- none returned useful results." OpenHands effectively requires frontier models (GPT-4o class or better), undermining the self-hosted/privacy value proposition for teams without expensive GPU infrastructure.

### 3. No Mid-Task Interruption

Users cannot provide guidance while the agent is working. You must explicitly stop the task to give instructions. This is a fundamental UX limitation vs. interactive tools like Claude Code or Cursor where you can interrupt and redirect.

### 4. No Cross-Session Memory

Each new conversation starts fresh. Complex multi-session projects require re-providing context every time. No persistent memory or project-level knowledge accumulation.

### 5. Configuration Complexity

OpenHands developers themselves acknowledged "there's an awful lot of problems with OH config/settings parallel systems." CLI improvements sometimes made other configuration paths worse. The OpenDevin-to-OpenHands rebranding added confusion (conflicting Docker images, repo URLs).

### 6. Docker Dependency

Full functionality requires Docker Desktop (+ WSL on Windows). This adds setup friction, especially for less technical users or restricted corporate environments.

### 7. Rate Limiting

Users hit API rate limits frequently, forcing tier upgrades or provider switches. One user had to pay $40 to upgrade their Anthropic API tier before switching to OpenRouter.

### 8. Agent Loops and Overcorrection

Token-hungry loops, overcorrections, and planning drift reported when tasks lack clear specs. Flaky tests or complex service orchestration can derail agent progress.

### 9. Non-localhost Deployment Breakage

After the V1 upgrade, non-localhost setups with custom domains and reverse proxies stopped working (WebSocket connection failures). This is particularly painful for the self-hosted use case.

### 10. Codebase Degradation Risk

Multiple community reports of codebases "rotting" when agent output isn't rigorously reviewed. Subtle, hard-to-detect mistakes (e.g., agent silently removing text it should have kept) are a recurring concern.

---

## User Feedback Summary

### Hacker News (OpenHands creator thread)

The OpenHands creator (rbren) stated:
- Agents deliver "massive boost to productivity" once you develop intuition for when to use them
- Best for "simple, tedious things like fixing merge conflicts or failing linters" and "getting an existing PR over the line"
- ~20% of OpenHands commits involve agent contribution

Community pushback:
- "How is reviewing agent code a massive boost when scrutiny burden exceeds that of junior developers?"
- Agents excel at "bite-sized, individually verifiable tasks" but produce subtle mistakes frequently
- Risk of codebase degradation without adequate review
- "We are not even close to the point where AI can replace a software engineer"

### Japanese Developer Experience (Zenn)

A developer deployed OpenHands on Google Cloud for remote access:
- $30/hour in API costs with Sonnet 3.7
- Rate limiting forced provider switches
- Concluded Devin at $500/month is better value when factoring in infrastructure, parallel execution, and integrations

### Comparative Testing (Medium)

In a $10-budget comparison of OpenHands, Cline, and Goose:
- OpenHands rated most stable (3 stars)
- "Both OpenHands and Goose produced something that works for $10"
- Cline spent most of its budget troubleshooting its own errors

### General Developer Sentiment

- "If you're looking for a drop-in replace-a-developer button, this isn't it. If you want an experimental but promising agent you can shape to your stack, it's compelling."
- Developers use OpenHands for 80% of work (especially backend), then switch to interactive IDE for debugging, refinement, and UI
- The agent architecture matters as much as the underlying model (same model, different agent scaffolding = different results)

---

## Learnings for banto

### What Users Actually Want

- **Cost Visibility is Critical.** The #1 pain point across all OpenHands feedback is cost surprise. banto should surface per-session and per-task cost tracking prominently in the dashboard. This is a real differentiator for a monitoring dashboard -- show what each agent run actually costs.
- **Mid-Task Interaction is a Key UX Differentiator.** OpenHands' inability to interrupt running agents is a major limitation. banto's terminal-based approach (where the user can interact with Claude Code directly) naturally solves this. This is a genuine advantage to preserve and highlight.
- **Cross-Session Memory Matters.** OpenHands has no persistent memory between sessions. banto could accumulate project-level context across sessions (past decisions, known patterns, test results) and inject it into new sessions. This compounds agent effectiveness over time.
- **The "Jot, Throw, Watch" Pattern is Validated.** The most successful OpenHands usage pattern matches banto's core flow: define a scoped task, hand it to an agent, review the result. Open-ended feature design without clear specs causes agent planning drift and looping.

### Technical Design Lessons

- **Event-Sourced State is the Right Pattern.** OpenHands V1's event-sourced state model (append-only events, deterministic replay, session recovery) is well-validated at scale. banto's `sessions + session_events` table design aligns with this. Key takeaway: make events immutable, keep ConversationState as the only mutable entity.
- **Workspace Abstraction Matters.** OpenHands' ability to run the same agent locally or in containers with minimal code change is elegant. For banto's NixOS container design, a similar abstraction (LocalWorkspace vs. ContainerWorkspace) would prevent tight coupling between session management and execution environment.
- **Agent Scaffolding Matters More Than Model.** OpenHands Index data shows the same model produces significantly different results with different agent scaffolding (Auggie solved 17 more SWE-Bench problems than Claude Code, both running Opus 4.5). For banto, this means the session setup (context injection, workspace configuration, tool availability) is as important as the underlying model.

### UX Pattern Lessons

- **Stability > Features for Single-User.** OpenHands' most praised quality in comparative testing was stability. For a single-user dashboard managing parallel agents, reliability of the dashboard itself is paramount. No crashes, no lost sessions, no broken WebSocket connections.
- **Configuration Should Be Minimal.** OpenHands' configuration complexity is a recurring pain point. banto should aim for near-zero configuration -- sensible defaults for a single-user NixOS setup, with overrides only when needed.

### Business & Ecosystem Lessons

- **Don't Over-Abstract Model Support.** OpenHands supports 100+ models via LiteLLM but "requires frontier models" for useful results in practice. banto's CC-only principle (Claude Code only) is correct -- supporting many models adds complexity without real value when only 2-3 actually work well.

---

## Sources

- [All-Hands-AI/OpenHands — GitHub Repository](https://github.com/All-Hands-AI/OpenHands)
- [OpenHands Documentation](https://docs.all-hands.dev/)
- [OpenHands Cloud (app.all-hands.dev)](https://app.all-hands.dev/)
- [OpenHands Software Agent SDK Documentation](https://docs.all-hands.dev/modules/usage/sdk)
- [SWE-Bench Verified Leaderboard](https://www.swebench.com/)
- [Japanese Developer Experience — Zenn article on deploying OpenHands on GCP](https://zenn.dev/)
- [Medium: Comparative Testing of OpenHands, Cline, and Goose](https://medium.com/)
- [HN: OpenHands creator thread (rbren)](https://news.ycombinator.com/)
