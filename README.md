# banto

Coding task dashboard for autonomous agents. Memo what you want to do, throw it at an agent, see results.

![screenshot](docs/screenshot.png)

## Stack

- **Runtime**: Bun
- **Backend**: Elysia + bun:sqlite
- **Frontend**: React + Tailwind CSS + Eden (type-safe RPC)
- **Agent**: Claude Agent SDK v2

## Setup

```bash
bun install
```

## Development

```bash
bun run dev
```

Mock runner mode (no real agent):

```bash
BANTO_MOCK_RUNNER=1 bun run dev
```

## Test

```bash
bun test
bun run test:ime:fast
bun run test:ime:full
```

## Lint / Format / Typecheck

```bash
bun run lint
bun run fmt
bun run typecheck
```
