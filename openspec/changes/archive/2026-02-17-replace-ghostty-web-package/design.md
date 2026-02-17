## Context

`TerminalView` currently relies on dynamic import and type references to `@nicolo-ribaudo/ghostty-web`. The existing OpenSpec artifacts and architecture intent refer to Coder's upstream package (`ghostty-web`).

The migration goal is name/source alignment, not behavior change.

## Decision

Use npm package `ghostty-web` (repository: `coder/ghostty-web`) as the terminal renderer dependency.

### Migration surface

1. Dependency declaration
   - `package.json` dependency key changes to `ghostty-web`

2. Type/import references
   - `import("@nicolo-ribaudo/ghostty-web")` -> `import("ghostty-web")`
   - ambient declaration module name updated to `ghostty-web`

3. Lockfile
   - refresh lockfile so installed dependency graph matches package manifest
   - keep lockfile churn minimal and limited to entries required by the dependency rename

## Lockfile Boundary

The repository currently has unrelated lockfile drift from previous work. This change treats lockfile updates as a constrained supplement for dependency-source alignment only.

Allowed in this change:
- add/remove lock entries directly attributable to `@nicolo-ribaudo/ghostty-web` -> `ghostty-web`
- transitive entry updates caused by that replacement

Not included in this change:
- broad lockfile normalization unrelated to terminal renderer dependency source
- opportunistic dependency upgrades for other packages

If large unrelated churn appears after lockfile generation, split it into a separate change.

## Compatibility Notes

- Terminal API usage remains the same (`init`, `Terminal`, `open`, `write`, `onData`, `resize`)
- WebSocket and resize endpoint integrations are unchanged
- Existing feature expectations in terminal-renderer specs remain valid

## Verification Plan

1. Static checks
   - `bun run typecheck`
   - `bun run build`

2. Terminal smoke checks (manual)
   - Open an active task and confirm terminal mounts without runtime error
   - Confirm PTY output appears in terminal (WebSocket receive path)
   - Type a command and confirm input reaches session (stdin send path)
   - Resize browser pane/window and confirm terminal reflows and resize API is called
   - Open a done/failed session and confirm replay-only behavior (view output, no interactive input)

3. Regression guard
   - Search workspace for remaining `@nicolo-ribaudo/ghostty-web` runtime imports and declarations

## Risks and Mitigations

- **Risk: Bundler/WASM asset resolution differences**
  - Mitigation: run build and verify terminal mounts and receives PTY output

- **Risk: Subtle API drift between package variants**
  - Mitigation: keep current type shape, run typecheck, and run terminal smoke test
