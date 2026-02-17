## MODIFIED Requirements

### Requirement: Initialize terminal using official ghostty-web package
The system SHALL initialize the browser terminal by importing from npm package `ghostty-web` (Coder upstream), calling `init()` asynchronously, and creating a `Terminal` instance for rendering.

#### Scenario: Terminal component mounts
- **WHEN** the terminal component mounts
- **THEN** the system loads `ghostty-web` asynchronously
- **AND** initializes WASM via `init()` before opening the terminal

#### Scenario: Dependency source validation
- **WHEN** dependencies are installed from `package.json`
- **THEN** the terminal renderer dependency is resolved from package name `ghostty-web`
- **AND** no `@nicolo-ribaudo/ghostty-web` reference remains in runtime imports

### Requirement: Preserve terminal runtime behavior after dependency rename
The system SHALL preserve existing terminal behavior after dependency source replacement.

#### Scenario: Existing terminal flow still works
- **WHEN** a user opens a task with an active session
- **THEN** terminal output is rendered via WebSocket frames
- **AND** keyboard input is forwarded to the server for interactive sessions
- **AND** terminal resize continues to trigger local resize and server resize API calls
