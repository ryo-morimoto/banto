## 1. Unit Layer (IME State)

- [x] 1.1 Add shared IME fixtures covering common composition flows (simple commit, reconversion, cancel, mixed Latin + IME)
- [x] 1.2 Add unit tests for composition lifecycle transitions and committed text emission
- [x] 1.3 Add regression tests ensuring no duplicate writes on `compositionend` + `input` ordering differences

## 2. Integration Layer (Terminal + WebSocket Boundary)

- [x] 2.1 Introduce terminal adapter interface and production adapter implementation
- [x] 2.2 Add fake terminal adapter for tests with write/listener inspection helpers
- [x] 2.3 Add integration tests for terminal view wiring: IME event sequence -> WebSocket send behavior
- [x] 2.4 Add integration tests ensuring done/failed sessions block stdin writes

## 3. End-to-End Layer (Smoke)

- [x] 3.1 Add E2E smoke test that starts a task session and commits Japanese text via IME flow
- [x] 3.2 Add E2E smoke test that verifies reconnect/replay does not corrupt committed IME output

## 4. Tooling & CI

- [x] 4.1 Add `test:ime:fast` script (unit + integration)
- [x] 4.2 Add `test:ime:full` script (includes E2E)
- [x] 4.3 Wire IME fast checks into PR CI and document full-check trigger

## 5. Documentation

- [x] 5.1 Document test layer responsibilities and fixture authoring guide
- [x] 5.2 Document how to add regression fixtures from production IME bugs
