## Why

IME behavior in the terminal path is currently hard to verify end-to-end. Bugs around composition text, cursor placement, and commit timing can regress silently because the project only has ad-hoc checks and no dedicated IME-focused harness.

Without layered tests, we either overfit brittle browser tests or miss integration bugs between WebSocket transport and terminal rendering. A layered test infrastructure gives quick feedback at the right level, keeps tests maintainable, and makes IME support safer to evolve.

## What Changes

- Add a three-layer IME test strategy for terminal input handling:
  - deterministic unit tests for composition state transitions
  - integration tests for browser terminal wiring + WebSocket boundaries
  - targeted end-to-end smoke tests for real IME flows
- Add shared IME fixtures (composition sequences and expected terminal writes) usable across all layers
- Introduce test adapters to decouple terminal component logic from the concrete terminal implementation for deterministic testing
- Add CI entry points that run IME tests in fast and full modes

## Capabilities

### New Capabilities

- `ime-layered-test-infra`: Provide consistent IME-focused test coverage across unit, integration, and end-to-end layers with shared fixtures and clear ownership boundaries

### Modified Capabilities

- `terminal-renderer`: Add deterministic test hooks for composition/input handling without changing runtime behavior

## Impact

- **Testing**: Adds dedicated IME test suites and shared fixture utilities
- **CI**: Adds new test commands/jobs for IME fast path and full path
- **Client architecture**: Adds lightweight seams/interfaces to test terminal input behavior deterministically
- **Risk reduction**: Improves confidence for Japanese/Chinese/Korean IME input flows in the terminal UI
