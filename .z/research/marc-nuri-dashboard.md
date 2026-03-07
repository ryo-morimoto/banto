# AI Coding Agent Dashboard (manusa/not-yet-released) Research

Date: 2026-02-23
Sources:
- https://blog.marcnuri.com/ai-coding-agent-dashboard

Marc Nuri (Principal Software Engineer at Red Hat) built a real-time web dashboard to monitor and orchestrate multiple AI coding agents (primarily Claude Code) running in parallel across devices, projects, and git branches. The motivation came from running 5-10 concurrent Claude Code sessions across a MacBook and a Linux workstation, where cognitive overhead of tracking which agent was doing what became the primary bottleneck. The dashboard is not yet open-sourced; the author is considering releasing hook scripts, heartbeat protocol, and enricher framework.

---

## Overview

Marc Nuri built a real-time web dashboard to monitor and orchestrate multiple AI coding agents (primarily Claude Code) running in parallel across devices, projects, and git branches. The motivation came from running 5-10 concurrent Claude Code sessions across a MacBook and a Linux workstation, where cognitive overhead of tracking which agent was doing what became the primary bottleneck.

Terminal multiplexers (tmux) solve local organization but not cross-device visibility. IDE-based solutions are tied to a specific editor. The dashboard fills the gap: a single, real-time view of all agent sessions across all machines, accessible from any device (including mobile for commute-time orchestration).

Key insight from the blog: "The biggest bottleneck in AI-assisted parallel development isn't the AI itself -- it's the human. When orchestrating multiple agents, the cognitive load of context switching between sessions becomes the primary constraint."

---

## Architecture

### Three-Layer Design

1. **Hook Layer (Agent-Side)** - Lightweight scripts that run on each machine alongside the coding agent. For Claude Code, these are notification hooks that fire on agent state transitions (working, idle, awaiting permission). The hook posts session state to the dashboard API.

2. **Enricher Layer (Server-Side)** - Raw heartbeat data passes through a chain of enrichers, each extracting or deriving specific information:
   - Transcript enricher: parses agent output to extract model name, token usage, context percentage
   - PR enricher: detects pull request URLs from git branch state
   - Each enricher is independent and composable

3. **Dashboard Layer (Frontend)** - Web-based UI showing session cards with real-time state, context usage, and controls for launching new sessions.

### Heartbeat Protocol

The system follows a heartbeat model. Each session reports state at regular intervals including:
- Project information
- Git status (branch, changes)
- Context usage percentage
- Active MCP servers
- Agent's current task/status

Stale detection: if an agent stops reporting for too long, the session card flags it automatically.

### Terminal Relay

For terminal attachment, the backend establishes a WebSocket relay between the browser and the remote machine's terminal session. Both the agent and the human connect to the same underlying tmux session, enabling simultaneous interaction.

### Session Lifecycle

- From the dashboard, user picks a device + repository
- A fresh Claude Code session spins up in a new tmux window on the target machine
- The dashboard picks it up immediately via heartbeat and starts tracking
- Sessions can be launched while commuting and reviewed later

### Hook/Enricher Pattern (Core Innovation)

This is the design decision the author is "happiest with." The pattern separates:

- **Hooks** = agent-specific adapters that emit raw heartbeat data
- **Enrichers** = composable processors that derive structured metadata from raw data

This separation makes the system **agent-agnostic at the core**. The dashboard itself never needs to know the internals of any particular agent. Supporting a new CLI agent (Goose, Gemini CLI, etc.) requires only:
1. A new hook script (agent-specific)
2. A new enricher (agent-specific interpretation)
3. Everything else (UI, stale detection, terminal relay, session management) stays unchanged

### Externalized State

Rather than keeping session state in terminal windows and human memory, the dashboard externalizes it into a queryable, visible system. This directly attacks the context-switching problem -- glancing at the dashboard reveals the state of every agent instantly.

### Real-Time Over Analytics

The dashboard is optimized for live orchestration and intervention, not long-term analytics. The focus is: what is happening right now, and what needs my attention next?

### Architecture Diagram & Pseudo-Code (Illustrative)

> Note: The dashboard is not open-sourced. The following diagram and code are illustrative
> reconstructions based on the blog post descriptions, not actual source code.

**Data Flow: Hook -> Enricher -> Dashboard**

```
┌─────────────────────┐     ┌─────────────────────┐
│  Machine A (MacBook) │     │  Machine B (Linux)   │
│                      │     │                      │
│  ┌────────────────┐  │     │  ┌────────────────┐  │
│  │ Claude Code #1 │  │     │  │ Claude Code #3 │  │
│  │ Claude Code #2 │  │     │  │ Claude Code #4 │  │
│  └──────┬─────────┘  │     │  └──────┬─────────┘  │
│         │ hooks      │     │         │ hooks      │
│  ┌──────▼─────────┐  │     │  ┌──────▼─────────┐  │
│  │  Hook Scripts   │  │     │  │  Hook Scripts   │  │
│  └──────┬─────────┘  │     │  └──────┬─────────┘  │
└─────────┼────────────┘     └─────────┼────────────┘
          │ HTTP POST heartbeat        │
          ▼                            ▼
┌──────────────────────────────────────────────────┐
│              Dashboard Server                     │
│                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │ Transcript   │→│ PR           │→│ Stale     │ │
│  │ Enricher     │  │ Enricher     │  │ Detector  │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│         Enricher Chain (composable pipeline)      │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │            Session State Store               │ │
│  └──────────────────┬──────────────────────────┘ │
│                     │ WebSocket push              │
└─────────────────────┼────────────────────────────┘
                      ▼
           ┌─────────────────────┐
           │  Browser Dashboard   │
           │  (Session Cards UI)  │
           └─────────────────────┘
```

**Heartbeat Protocol Interface**

```typescript
// Illustrative — not actual source code

interface Heartbeat {
  sessionId: string;
  machineId: string;
  project: string;
  gitBranch: string;
  gitDirty: boolean;
  agentStatus: "working" | "idle" | "awaiting_permission";
  timestamp: number; // Unix ms
}

interface EnrichedSession extends Heartbeat {
  modelName?: string;
  tokenUsage?: { input: number; output: number };
  contextPercent?: number;      // 0-100
  pullRequestUrl?: string;
  isStale: boolean;             // derived: now - timestamp > threshold
  lastSeenAgo: number;          // seconds since last heartbeat
}

const STALE_THRESHOLD_MS = 60_000; // 1 minute without heartbeat = stale
```

**Enricher Chain Pattern**

```typescript
// Illustrative — not actual source code

type Enricher = (session: EnrichedSession, raw: Heartbeat) => EnrichedSession;

const transcriptEnricher: Enricher = (session, raw) => ({
  ...session,
  modelName: parseModelFromTranscript(raw),
  tokenUsage: parseTokenUsage(raw),
  contextPercent: parseContextPercent(raw),
});

const prEnricher: Enricher = (session, raw) => ({
  ...session,
  pullRequestUrl: detectPrFromBranch(raw.gitBranch),
});

const staleEnricher: Enricher = (session, _raw) => ({
  ...session,
  isStale: Date.now() - session.timestamp > STALE_THRESHOLD_MS,
  lastSeenAgo: Math.floor((Date.now() - session.timestamp) / 1000),
});

// Compose enrichers into a pipeline
const enricherChain: Enricher[] = [transcriptEnricher, prEnricher, staleEnricher];

function enrich(raw: Heartbeat): EnrichedSession {
  const initial: EnrichedSession = { ...raw, isStale: false, lastSeenAgo: 0 };
  return enricherChain.reduce((session, enricher) => enricher(session, raw), initial);
}
```

---

## Well-Regarded Features

### 1. Context Percentage as Primary Metric

"Of all the fields on the dashboard, context usage has been the best predictor of where to look next."

When an agent runs high on context, it usually means:
- Progress needs review
- A fresh session reset is needed
- Preparation for handoff

This is the most actionable signal in the entire dashboard.

### 2. PR Awareness

Session cards show which sessions have produced pull requests with direct links. This shortens the review loop: orchestration -> review without hunting through GitHub notifications.

### 3. Cross-Device Session Launch

Start sessions on any registered device from anywhere. Distribute work based on machine capabilities:
- Resource-intensive tasks -> workstation
- Lighter tasks -> laptop

This fundamentally changes when and where the user can be productive.

### 4. Session Cards with Rich Metadata

Each card displays:
- Project name
- Git branch
- Model name
- Context usage (percentage)
- Agent status (working / idle / awaiting permission / stale)
- Associated PRs

### 5. Stale/Crash Detection

Automatic detection when an agent stops reporting, surfaced directly on the session card.

### 6. Terminal Attachment via Browser

WebSocket relay enables interacting with the actual terminal session from the browser, without needing SSH or direct terminal access.

---

## Poorly-Regarded Features / Pain Points

The dashboard is not yet open-sourced and community feedback is limited to blog comments and social media reactions. No specific pain points or poorly-regarded features have been documented publicly at this time.

---

## User Feedback Summary

The blog post (published 2026-02-23) has not appeared on Hacker News or Reddit as a standalone submission. Marc Nuri shared it on X/Twitter. The dashboard is not yet open-sourced, which limits community feedback to blog comments.

The concepts align with a growing ecosystem of similar tools:
- **agtrace** (HN Show, Dec 2025): "top for AI coding agents" - local CLI dashboard for context window monitoring
- **Sidekick** (HN Show, Mar 2026): VS Code extension + terminal dashboard for real-time agent monitoring
- **Open Agent** (HN Show, Jan 2026): containerized workspaces with web dashboard

Marc Nuri's approach is distinctive in its cross-device focus and the hook/enricher separation pattern.

---

## Learnings for banto

### What Users Actually Want

- **Context Percentage is the Killer Metric**: banto should surface context window usage prominently on task/session cards. This is the single best predictor of "what needs attention" in a multi-agent workflow. When context is high, the user needs to act (review, reset, or hand off).

- **Session Cards Should Show Actionable State**: The minimum viable session card needs: project + branch, agent status (working / idle / needs input / stale), context usage percentage, and link to PR (if created). These four fields let the user triage instantly without opening a terminal.

- **Human Bottleneck is the Real Problem**: "The biggest bottleneck in AI-assisted parallel development isn't the AI itself -- it's the human." banto's UI should minimize cognitive load: sort/prioritize sessions by "needs attention" signals, auto-surface sessions that need human intervention, and keep the one-screen principle -- everything visible at a glance.

### Technical Design Lessons

- **Hook/Enricher Pattern Maps to banto's Architecture**: banto can adopt a similar layered approach: Hook layer (Claude Code notification hooks post heartbeats to banto's API via Elysia backend), Enricher layer (server-side chain that derives structured metadata -- model, tokens, context %, PRs, git state -- from raw hook data), and Presentation layer (React frontend renders session cards). This pattern keeps the core agent-agnostic, even though banto currently targets only Claude Code ("CC only" principle). If that constraint relaxes later, the architecture is ready.

- **Heartbeat + Stale Detection for "Watch" Aspect**: banto's core loop is "jot, throw, watch." The heartbeat model is exactly how "watch" should work: regular state reports from running sessions, automatic stale detection when reports stop, session cards that always reflect current reality. This is more reliable than polling or log-tailing approaches.

### UX Pattern Lessons

- **Terminal Relay is Valuable but Complex**: Marc Nuri's WebSocket terminal relay is powerful (interact with running agents from the browser). banto already has terminal ambitions (restty / ghostty-web exploration). The relay pattern (backend WebSocket <-> tmux session) is the proven approach.

- **Real-Time Focus Over Analytics**: banto's purpose ("what's running, what's done, what needs attention") aligns perfectly with Marc Nuri's "live orchestration, not analytics" philosophy. Don't over-invest in historical dashboards early -- focus on the live state view.

### Business & Ecosystem Lessons

- **Cross-Device is Natural for Web Dashboards**: banto already targets PWA. The web dashboard naturally provides cross-device access. Marc Nuri's insight that "sessions can be kicked off while commuting" validates banto's PWA strategy.

---

## Sources

- [AI Coding Agent Dashboard (blog post)](https://blog.marcnuri.com/ai-coding-agent-dashboard) — Primary source for this research
- [Marc Nuri's GitHub (manusa)](https://github.com/manusa) — Author's GitHub profile
- [Marc Nuri on X/Twitter (@MarcNuri)](https://x.com/MarcNuri) — Author's X profile
- [Marc Nuri's personal site](https://www.marcnuri.com/) — Author's homepage
- [agtrace — "top for AI coding agents"](https://github.com/lanegrid/agtrace) ([HN discussion](https://news.ycombinator.com/item?id=42425670))
- [Sidekick Agent Hub — VS Code + terminal agent monitoring](https://github.com/cesarandreslopez/sidekick-agent-hub) ([HN discussion](https://news.ycombinator.com/item?id=47164432))
- [Open Agent / sandboxed.sh — containerized agent workspaces](https://github.com/Th0rgal/openagent) ([HN discussion](https://news.ycombinator.com/item?id=46733863))
