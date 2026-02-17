## Context

Terminal rendering and input are now WebSocket + terminal-emulator based. IME input is different from plain keypress input because it includes a composition lifecycle (`compositionstart` -> `compositionupdate` -> `compositionend`) and can interleave with normal keyboard events.

The main risk is hidden coupling between DOM events, terminal adapter behavior, and transport boundaries. A single test layer cannot catch all issues efficiently:
- unit tests are fast but cannot validate browser event wiring
- end-to-end tests validate real behavior but are slower and harder to debug

We need layered tests with shared expectations so failures are local and actionable.

## Goals / Non-Goals

**Goals:**
- Validate IME composition lifecycle handling deterministically
- Ensure transport boundaries do not duplicate/drop committed IME text
- Keep tests stable and debuggable by isolating layers
- Reuse one canonical fixture set across all layers

**Non-Goals:**
- Perfectly emulate every OS/browser IME implementation detail
- Add visual regression testing for terminal rendering
- Replace existing general-purpose tests unrelated to IME

## Decisions

### 1. Introduce explicit layers with clear assertions

**Choice**: Maintain three suites with distinct responsibilities.

- **Unit layer**: pure input/composition state behavior
- **Integration layer**: component + mock terminal adapter + mock WebSocket behavior
- **E2E layer**: browser-driven IME smoke scenarios against running app

**Rationale**: Fast local feedback from unit/integration; confidence from a small E2E set.

### 2. Shared IME fixture package

**Choice**: Create shared fixtures that describe ordered event sequences and expected output writes, imported by all suites.

Fixture shape:
```ts
type ImeFixture = {
  name: string;
  steps: Array<
    | { kind: "compositionstart" }
    | { kind: "compositionupdate"; data: string }
    | { kind: "compositionend"; data: string }
    | { kind: "input"; data: string }
  >;
  expectedWrites: string[];
};
```

**Rationale**: One source of truth avoids drift between test levels.

### 3. Terminal adapter seam for integration tests

**Choice**: Use a small terminal adapter interface in terminal view logic; production uses ghostty-web adapter, tests use in-memory fake.

**Rationale**: Allows deterministic assertions for written input and listener behavior without WASM/runtime instability.

### 4. CI modes

**Choice**:
- `test:ime:fast` runs unit + integration layers on each PR
- `test:ime:full` includes E2E IME smoke tests (can be required for protected branches)

**Rationale**: Fast default checks with an explicit higher-confidence path.

## Risks / Trade-offs

- **[Fixture oversimplification]** Some real-world IME edge cases may be missing; mitigate by adding captured regressions as new fixtures
- **[E2E flakiness]** Browser IME automation can be unstable; keep E2E suite minimal and focused on smoke coverage
- **[Adapter seam complexity]** Extra abstraction can grow; constrain adapter to minimal methods used by terminal input flow

## Open Questions

- Which browser runner provides the most stable IME automation in this repo's CI environment?
- Should `test:ime:full` run on every PR or only on merge queue/nightly?
