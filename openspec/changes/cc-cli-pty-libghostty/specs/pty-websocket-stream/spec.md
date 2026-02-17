## ADDED Requirements

### Requirement: WebSocket endpoint for PTY pipe
The system SHALL expose a WebSocket endpoint at `WS /api/tasks/:id/terminal` that serves as a pure bidirectional PTY pipe. The WebSocket SHALL carry only PTY data — no JSON control messages.

#### Scenario: Client connects to active session
- **WHEN** a WebSocket connection is opened to `/api/tasks/:id/terminal` for a task with `session_status` in (`provisioning`, `running`, `waiting_for_input`)
- **THEN** the system accepts the connection and subscribes it to the task's ptyStore

#### Scenario: Client connects when no active session
- **WHEN** a WebSocket connection is opened to `/api/tasks/:id/terminal` for a task with `session_status = null`
- **THEN** the system rejects the connection with an appropriate close code

#### Scenario: Client connects to done/failed session
- **WHEN** a WebSocket connection is opened to `/api/tasks/:id/terminal` for a task with `session_status` in (`done`, `failed`)
- **THEN** the system accepts the connection and sends the buffered output (replay), then holds the connection open (no further live data)

### Requirement: Stream PTY stdout to client as binary frames
The system SHALL forward PTY stdout bytes from the ptyStore to all subscribed WebSocket clients as binary frames, preserving byte order and without transformation.

#### Scenario: PTY emits output with connected client
- **WHEN** the ptyStore receives new PTY output for a task with subscribed WebSocket clients
- **THEN** the system sends the output as a binary WebSocket frame to each subscriber

#### Scenario: PTY emits output with no connected clients
- **WHEN** the ptyStore receives new PTY output for a task with no WebSocket subscribers
- **THEN** the system buffers the output in the ptyStore (up to the configured limit) without error

### Requirement: Forward client stdin to PTY
The system SHALL forward text frames received from WebSocket clients to the task's PTY process via the ptyStore. Stdin data SHALL be written to the `Bun.Terminal` instance as-is.

#### Scenario: Client sends keystrokes
- **WHEN** a WebSocket client sends a text frame
- **THEN** the system writes the frame content to the task's PTY stdin via the ptyStore

#### Scenario: Client sends stdin when session is done
- **WHEN** a WebSocket client sends a text frame for a task with `session_status` in (`done`, `failed`)
- **THEN** the system discards the input silently

### Requirement: Replay buffered output on reconnect
The system SHALL send all buffered PTY output from the ptyStore to a newly connected WebSocket client before streaming live data, so the client sees the full terminal state.

#### Scenario: Client reconnects mid-session
- **WHEN** a WebSocket client connects to a task with an active session and existing ptyStore buffer
- **THEN** the system sends the entire buffer content as binary frames first, then continues with live streaming

#### Scenario: Client connects with empty buffer
- **WHEN** a WebSocket client connects to a task with an active session and no buffered output
- **THEN** the system begins live streaming immediately without replay

### Requirement: ptyStore buffer management
The ptyStore SHALL buffer the last N bytes (configurable, default 1MB) of PTY output per task. When the buffer exceeds the limit, the oldest bytes SHALL be discarded. The buffer SHALL be cleared when a session is archived.

#### Scenario: Buffer exceeds limit
- **WHEN** new PTY output would cause the buffer to exceed the configured limit
- **THEN** the system discards the oldest bytes to make room for new data

#### Scenario: Session archived
- **WHEN** a session is archived (teardown sequence)
- **THEN** the system clears the ptyStore buffer for that task

### Requirement: Close WebSocket on session end
The system SHALL close all WebSocket connections for a task when the session's PTY process exits, after the final output bytes have been flushed.

#### Scenario: PTY process exits
- **WHEN** the PTY process exits (done or failed)
- **THEN** the system flushes any remaining output to subscribers, then closes all WebSocket connections for the task with an appropriate close code

### Requirement: Resize via REST endpoint
The system SHALL expose `POST /api/tasks/:id/terminal/resize` accepting `{ cols: number, rows: number }` to resize the PTY terminal. This is separate from the WebSocket to avoid protocol mixing.

#### Scenario: Resize active terminal
- **WHEN** a POST request to `/api/tasks/:id/terminal/resize` is received with valid `cols` and `rows` while a session is active
- **THEN** the system calls `resize(cols, rows)` on the task's `Bun.Terminal` instance and returns 200

#### Scenario: Resize with no active session
- **WHEN** a POST request to `/api/tasks/:id/terminal/resize` is received for a task with `session_status = null`
- **THEN** the system returns 404
