# banto

A dashboard to jot down tasks, throw them at an agent, and watch the results. Runs on a NixOS mini PC.

## Principles

- Best interface per agent: Use each agent's richest available integration (native protocol > ACP > PTY fallback)
- ACP as universal fallback: Any ACP-compatible agent is automatically supported
- Task = user's unit of work: Sessions are internal. Users think in tasks (goals), not sessions (executions)
- One view: Active tasks listed by project on a single screen
- Jot, throw, watch: Task management → agent execution → result review
- Function over form: Prioritize working features over UI polish

## Stack

- Runtime: Bun
- Backend: Elysia + Eden
- Frontend: React + TanStack Router + TanStack Query
- DB: bun:sqlite
- WebSocket: Elysia built-in WS
- Styling: Tailwind CSS
- Lint: oxlint
- Format: oxfmt
- Type checking: tsgo

## Directory Structure

Domain co-location is the top priority. No splitting by technical layer.

```
src/
├── server.ts
├── server/
│   ├── app.ts
│   ├── db.ts                 # SQLite connection (shared resource)
│   ├── projects/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   └── repository.ts
│   ├── tasks/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   └── repository.ts
│   ├── sessions/
│   │   ├── routes.ts
│   │   ├── service.ts
│   │   ├── repository.ts
│   │   ├── runner.ts         # Session execution orchestration
│   │   ├── events.ts         # Event ledger operations
│   │   └── terminal-relay.ts # WebSocket binary relay
│   └── agents/               # Agent provider layer
│       ├── types.ts           # AgentProvider, AgentSession interfaces
│       ├── registry.ts        # Provider registry + factory
│       ├── claude-code/
│       │   ├── provider.ts    # PTY + hooks + MCP integration
│       │   ├── hooks.ts       # HTTP hook endpoint handler
│       │   └── mcp-permission.ts
│       ├── codex/
│       │   ├── provider.ts    # app-server JSON-RPC wrapper
│       │   └── rpc-client.ts  # JSON-RPC 2.0 client
│       ├── acp/
│       │   ├── provider.ts    # ACP client wrapper (universal)
│       │   └── client.ts      # ACP JSON-RPC 2.0 client
│       └── pty/
│           ├── provider.ts    # Raw PTY fallback
│           └── state-detector.ts
├── client/
│   ├── app.tsx
│   ├── tasks/
│   │   ├── TaskList.tsx      # Left panel (pinned + grouped by project)
│   │   ├── TaskDetail.tsx    # Right panel (details + session history)
│   │   ├── CreateTask.tsx    # Modal
│   │   └── api.ts
│   ├── sessions/
│   │   ├── SessionDiff.tsx   # Separate page (diff view)
│   │   └── api.ts
│   ├── projects/
│   │   ├── CreateProject.tsx
│   │   └── api.ts
│   └── layout/
│       └── Root.tsx
├── shared/
│   └── types.ts
├── main.tsx
└── public/
    └── index.html
```

## Development Workflow: TDD (t-wada style)

Strictly follow Red → Green → Refactor.

1. **Red**: Write one failing test. Confirm it fails
2. **Green**: Write the minimum code to pass that test. Confirm it passes
3. **Refactor**: Clean up code while keeping tests green

- Never write production code without a test
- Add only one test at a time
- Write only the minimum code to pass the test (no anticipation)

## Coding Conventions

- Language: TypeScript
- Use path aliases for imports (`@/server/...`, `@/client/...`, `@/shared/...`)
- All domain-related code lives in its domain directory
- Only shared resources (DB connection, etc.) live outside domain directories
- Error handling only at boundaries (API layer). No unnecessary try-catch in internal code

## Todo Workflow

- Todo files live in `todos/` directory
- When working on a research todo (deep-research), the goal MUST include saving research results to `.z/research/<topic>.md`. Never consider a research task complete without persisting the findings.

## Research File Structure

All competitor deep-research files in `.z/research/` MUST follow the canonical structure defined in `.z/research/TEMPLATE.md`. The required H2 sections in order:

1. **Header**: `Date:`, `Sources:` (bullet list), 1-paragraph description, `---`
2. `## Overview`
3. `## Architecture`
4. `## Well-Regarded Features`
5. `## Poorly-Regarded Features / Pain Points` (with optional `### Top Issues by Reaction Count`)
6. `## User Feedback Summary`
7. `## Learnings for banto` (with exactly 4 H3s: What Users Actually Want / Technical Design Lessons / UX Pattern Lessons / Business & Ecosystem Lessons)
8. `## Sources`

Rules:
- No H2 numbering
- `---` between H2 sections
- Index every new file in `.z/research/README.md`

## Language Policy

This project is OSS. All documentation, code comments, commit messages, PR descriptions, issues, and variable names must be written in English. Only UI-facing text may be in Japanese.
