## Requirements

### Requirement: Start session with race-safe guard
The system SHALL start a new PTY session for a task only when `task.session_status` is null and `task.status` is `active`. The system SHALL use `BEGIN IMMEDIATE` to acquire a write lock, check `session_status`, set it to `pending` with `session_started_at = now()`, and commit — all within a single transaction. If `session_status` is not null, the system SHALL reject the request with 409 Conflict.

#### Scenario: Successful session start
- **WHEN** a start session request is received for a task with `status = active` and `session_status = null`
- **THEN** the system sets `session_status = pending` and `session_started_at` to the current timestamp within a `BEGIN IMMEDIATE` transaction, and returns success

#### Scenario: Reject when session already active
- **WHEN** a start session request is received for a task with `session_status` not null
- **THEN** the system returns 409 Conflict without modifying any fields

#### Scenario: Reject when task is not active
- **WHEN** a start session request is received for a task with `status != active`
- **THEN** the system returns 400 Bad Request

### Requirement: Provision worktree and spawn PTY
After a session is started (status = pending), the system SHALL create a git worktree for the task's project, spawn Claude Code CLI as a PTY process using `Bun.Terminal` + `Bun.spawn` with `cwd` set to the worktree path, and update `session_status` to `provisioning`. The system SHALL set `worktree_path` and `branch` on the task when the worktree is created.

#### Scenario: Successful provisioning
- **WHEN** session_status is `pending`
- **THEN** the system creates a git worktree, sets `worktree_path` and `branch` on the task, creates a `Bun.Terminal` instance, spawns `claude` CLI with `cwd` set to the worktree path, and updates `session_status` to `provisioning`

#### Scenario: Worktree creation fails
- **WHEN** git worktree creation fails
- **THEN** the system sets `session_status = failed` and `session_error` to the error message

### Requirement: Transition to running on first PTY output
The system SHALL update `session_status` from `provisioning` to `running` when the first PTY data callback fires.

#### Scenario: First data received
- **WHEN** the `Bun.Terminal` `data` callback fires for the first time
- **THEN** the system updates `session_status` to `running`

### Requirement: Handle PTY process exit
The system SHALL update `session_status` to `done` when the PTY process exits with code 0, and to `failed` with `session_error` set when the process exits with a non-zero code.

#### Scenario: Process exits successfully
- **WHEN** the PTY process exits with code 0
- **THEN** the system updates `session_status` to `done`

#### Scenario: Process exits with error
- **WHEN** the PTY process exits with a non-zero code
- **THEN** the system updates `session_status` to `failed` and sets `session_error` to include the exit code

### Requirement: Teardown session before retry or task completion
The system SHALL execute a teardown sequence before starting a new session or completing a task: (1) SIGTERM the PTY process if alive, wait a grace period, SIGKILL if needed, (2) clear the ptyStore buffer for the task, (3) within a `BEGIN IMMEDIATE` transaction: insert a row into `session_logs` and reset all `session_*` fields to null, (4) clean up the worktree if it exists.

#### Scenario: Retry after failed session
- **WHEN** a retry request is received for a task with `session_status = failed`
- **THEN** the system archives the current session to `session_logs` with `exit_status = failed`, resets all `session_*` fields to null, cleans up the worktree, and starts a new session

#### Scenario: Retry while session still running
- **WHEN** a retry request is received for a task with `session_status = running`
- **THEN** the system sends SIGTERM to the PTY process, waits a grace period, sends SIGKILL if needed, then proceeds with the archive and cleanup sequence

#### Scenario: Complete task with active session
- **WHEN** a complete task request is received while `session_status` is not null
- **THEN** the system executes the teardown sequence, archives to `session_logs`, resets `session_*` fields, and sets `task.status = done`

### Requirement: Forward PTY output to ptyStore
The system SHALL forward all PTY `data` callback output to the `ptyStore` for the task, which buffers it for WebSocket subscribers and reconnecting clients.

#### Scenario: PTY emits output
- **WHEN** the `Bun.Terminal` `data` callback fires with output bytes
- **THEN** the system pushes the bytes to `ptyStore` for the task

### Requirement: Forward stdin from ptyStore to PTY
The system SHALL write stdin data received from the ptyStore (originating from WebSocket clients) to the `Bun.Terminal` instance.

#### Scenario: Stdin received from client
- **WHEN** the ptyStore receives stdin data for a task
- **THEN** the system writes the data to the task's `Bun.Terminal` instance

### Requirement: Handle terminal resize
The system SHALL resize the `Bun.Terminal` instance when a resize request is received via the REST endpoint `POST /api/tasks/:id/terminal/resize`.

#### Scenario: Resize request received
- **WHEN** a POST request to `/api/tasks/:id/terminal/resize` is received with `{ cols, rows }`
- **THEN** the system calls `terminal.resize(cols, rows)` on the task's `Bun.Terminal` instance

#### Scenario: Resize when no active session
- **WHEN** a resize request is received for a task with `session_status = null`
- **THEN** the system returns 404

### Requirement: Server startup recovery
On server startup, the system SHALL find all tasks with `session_status` in (`pending`, `provisioning`, `running`, `waiting_for_input`), archive each to `session_logs` with `exit_status = failed` and `error = 'server restart'`, and reset all `session_*` fields to null. This MUST happen before the server accepts HTTP requests.

#### Scenario: Orphaned running session on startup
- **WHEN** the server starts and finds a task with `session_status = running`
- **THEN** the system inserts a row into `session_logs` with `exit_status = failed` and `error = 'server restart'`, resets all `session_*` fields to null

#### Scenario: No orphaned sessions on startup
- **WHEN** the server starts and no tasks have active `session_status`
- **THEN** the system proceeds to accept HTTP requests without modifying any tasks

### Requirement: Schema migration
The system SHALL apply schema changes: add 5 nullable columns to `tasks` (`session_status`, `worktree_path`, `branch`, `session_started_at`, `session_error`), create the `session_logs` table, and drop the `sessions`, `messages` tables and `todos` column.

#### Scenario: Fresh database
- **WHEN** the application starts with no existing database
- **THEN** the system creates the `tasks` table with session columns and the `session_logs` table, without creating `sessions` or `messages` tables

#### Scenario: Existing database migration
- **WHEN** the application starts with an existing database containing `sessions` and `messages` tables
- **THEN** the system adds the 5 session columns to `tasks`, creates `session_logs`, and drops `sessions`, `messages` tables and the `todos` column from `tasks`
