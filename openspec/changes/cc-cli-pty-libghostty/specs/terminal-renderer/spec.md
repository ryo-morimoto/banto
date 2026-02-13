## ADDED Requirements

### Requirement: Initialize ghostty-web terminal
The system SHALL initialize ghostty-web by calling `init()` asynchronously (WASM load) and create a `Terminal` instance with configurable `fontSize`, `cols`, and `rows`. Initialization MUST be deferred (not blocking page load).

#### Scenario: Terminal component mounts
- **WHEN** the terminal component mounts in the DOM
- **THEN** the system loads ghostty-web WASM asynchronously, creates a `Terminal` instance, and attaches it to the container element

#### Scenario: WASM fails to load
- **WHEN** ghostty-web WASM initialization fails
- **THEN** the system displays an error state in the terminal container instead of a blank area

### Requirement: Connect terminal to WebSocket
The system SHALL open a WebSocket connection to `WS /api/tasks/:id/terminal` and wire it to the ghostty-web terminal: `ws.onmessage` writes to `term.write()`, `term.onData` sends to `ws.send()`.

#### Scenario: Active session displayed
- **WHEN** a task has `sessionStatus` in (`provisioning`, `running`, `waiting_for_input`)
- **THEN** the system opens a WebSocket to `/api/tasks/{taskId}/terminal`, pipes incoming binary frames to `term.write()`, and pipes `term.onData` keystrokes to `ws.send()`

#### Scenario: WebSocket disconnects unexpectedly
- **WHEN** the WebSocket connection is lost while the session is still active
- **THEN** the system attempts to reconnect and replays the buffered output from the server

### Requirement: Display terminal for done/failed sessions
The system SHALL connect to the WebSocket for done/failed sessions to receive the replay buffer, rendering the terminal's last state. Stdin input SHALL be disabled (no `term.onData` → `ws.send` wiring).

#### Scenario: Viewing a completed session
- **WHEN** a task has `sessionStatus = done` or `sessionStatus = failed`
- **THEN** the system opens a WebSocket, receives replay buffer, renders the terminal state, and does not forward keystrokes

### Requirement: Hide terminal when no session
The system SHALL not render the terminal component when `task.sessionStatus` is null. The task detail view shows only task info and action buttons.

#### Scenario: Task with no session
- **WHEN** a task has `sessionStatus = null`
- **THEN** the terminal component is not rendered, and the "Start Session" button is visible

### Requirement: Send resize on terminal container resize
The system SHALL observe the terminal container's dimensions and send `POST /api/tasks/:id/terminal/resize` with updated `cols` and `rows` when the container resizes.

#### Scenario: Browser window resized
- **WHEN** the terminal container element changes dimensions
- **THEN** the system calculates new `cols` and `rows` based on the container size and character dimensions, calls `term.resize(cols, rows)` locally, and sends `POST /api/tasks/:id/terminal/resize` to the server

### Requirement: Remove SessionChatPanel and ChatMessage
The system SHALL delete `SessionChatPanel.tsx` and `ChatMessage.tsx` from the client. All session output viewing is handled by the ghostty-web terminal.

#### Scenario: Session output display
- **WHEN** a user views a task with an active or completed session
- **THEN** the system renders a ghostty-web terminal, not the legacy `SessionChatPanel` or `ChatMessage` components

### Requirement: Simplify TaskInfoPanel
The system SHALL remove session query logic and the "Agent Todo" section from `TaskInfoPanel`. Session status is read from `task.sessionStatus` directly. The "Start Session" button is shown when `sessionStatus = null` and `status = active`. A "Retry" button is shown when `sessionStatus` is `done` or `failed`.

#### Scenario: Task info with no session
- **WHEN** `task.sessionStatus` is null and `task.status` is `active`
- **THEN** the system shows the "Start Session" button and no terminal

#### Scenario: Task info with running session
- **WHEN** `task.sessionStatus` is `running`
- **THEN** the system hides the "Start Session" button and renders the terminal

#### Scenario: Task info with failed session
- **WHEN** `task.sessionStatus` is `failed`
- **THEN** the system shows the terminal (replay) and a "Retry" button
