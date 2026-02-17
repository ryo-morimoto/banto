## ADDED Requirements

### Requirement: Layered IME test suites
The system SHALL provide IME-focused tests in three layers: unit, integration, and end-to-end. Each layer SHALL have a defined scope and SHALL be runnable independently.

#### Scenario: Run fast IME checks
- **WHEN** a developer runs the fast IME test command
- **THEN** the system executes unit and integration IME suites without running end-to-end tests

#### Scenario: Run full IME checks
- **WHEN** a developer runs the full IME test command
- **THEN** the system executes unit, integration, and end-to-end IME suites

### Requirement: Shared IME fixture definitions
The system SHALL maintain shared IME fixture definitions that describe event sequences and expected committed output. Unit, integration, and end-to-end tests SHALL consume these fixtures directly or via generated projections.

#### Scenario: Add new IME regression fixture
- **WHEN** a new IME regression is discovered
- **THEN** the system allows adding one fixture definition that can be reused by all test layers

### Requirement: Deterministic composition lifecycle assertions
Unit tests SHALL validate composition lifecycle handling, including commit, cancellation, and mixed-language input, and SHALL assert that committed output is emitted exactly once per commit.

#### Scenario: Composition commit emits once
- **WHEN** a composition sequence ends with committed text
- **THEN** the unit test asserts one committed write matching the expected fixture output

#### Scenario: Composition canceled
- **WHEN** a composition sequence is canceled before commit
- **THEN** the unit test asserts no committed write is emitted

### Requirement: Terminal boundary integration coverage
Integration tests SHALL verify terminal view input wiring between browser events, terminal adapter callbacks, and WebSocket sends for IME scenarios.

#### Scenario: IME events produce expected WebSocket sends
- **WHEN** integration tests replay an IME fixture through terminal view input handlers
- **THEN** the observed WebSocket sends match fixture expectations in order and cardinality

#### Scenario: Completed session blocks input
- **WHEN** a task session status is `done` or `failed`
- **THEN** integration tests assert that IME and keyboard input are not forwarded to WebSocket

### Requirement: End-to-end IME smoke coverage
The system SHALL include end-to-end smoke tests that validate committed IME text appears correctly in the running terminal session and remains correct after reconnect/replay.

#### Scenario: Japanese IME commit in live session
- **WHEN** an end-to-end test performs a Japanese IME commit during a running session
- **THEN** the terminal output includes the committed text without duplicated characters

#### Scenario: Reconnect preserves committed output
- **WHEN** the terminal WebSocket reconnects after an IME commit
- **THEN** replayed output preserves the committed text exactly once
