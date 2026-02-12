# banto

A dashboard to jot down tasks, throw them at an agent, and watch the results. Runs on a NixOS mini PC.

## Principles

- CC only: No multi-provider abstractions
- 1 session = 1 unit of execution
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
│   └── sessions/
│       ├── routes.ts
│       ├── service.ts
│       ├── repository.ts
│       ├── runner.ts         # Session execution orchestration
│       ├── container.ts      # nixos-container operations
│       └── agent.ts          # Agent SDK operations
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

## Language Policy

This project is OSS. All documentation, code comments, commit messages, PR descriptions, issues, and variable names must be written in English. Only UI-facing text may be in Japanese.
