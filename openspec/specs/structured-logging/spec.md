## ADDED Requirements

### Requirement: Base log schema follows OTel Semantic Conventions
Every log entry SHALL include the following base fields: `timestamp` (ISO 8601), `severity.text` (uppercase level name), `message`, `service.name`, and `deployment.environment`. Additional context fields MAY be appended.

#### Scenario: Standard log entry
- **WHEN** `logger.info("Server started", { port: 3000 })` is called
- **THEN** output is a single JSON line to stderr containing `timestamp`, `severity.text` as `"INFO"`, `message` as `"Server started"`, `service.name` as `"banto"`, `deployment.environment`, and `port` as `3000`

#### Scenario: Context fields do not overwrite base fields
- **WHEN** a context object contains a key named `timestamp` or `severity.text`
- **THEN** the base schema fields take precedence and the context values are ignored

### Requirement: Log levels with environment-aware filtering
The logger SHALL support four severity levels: `debug`, `info`, `warn`, `error`. The minimum output level SHALL be controlled by the `LOG_LEVEL` environment variable. When `LOG_LEVEL` is not set, the default SHALL be `debug`.

#### Scenario: Debug log suppressed in production
- **WHEN** `LOG_LEVEL` is set to `"info"` and `logger.debug("details")` is called
- **THEN** no output is written to stderr

#### Scenario: Debug log emitted in development
- **WHEN** `LOG_LEVEL` is not set (or set to `"debug"`) and `logger.debug("details")` is called
- **THEN** a JSON line with `severity.text` as `"DEBUG"` is written to stderr

#### Scenario: All levels at or above threshold are emitted
- **WHEN** `LOG_LEVEL` is set to `"warn"`
- **THEN** `logger.warn()` and `logger.error()` produce output, while `logger.info()` and `logger.debug()` do not

### Requirement: Timer primitive for duration measurement
The logger SHALL provide a `startTimer()` method that returns an end function. Calling the end function SHALL emit a log entry with a `duration_ms` field representing elapsed wall-clock time in milliseconds.

#### Scenario: Measure operation duration
- **WHEN** `const end = logger.startTimer()` is called, an operation runs for approximately 50ms, and `end("info", "Op done", { op: "test" })` is called
- **THEN** a log entry is emitted with `duration_ms` as a number greater than or equal to 0, `severity.text` as `"INFO"`, and `op` as `"test"`

#### Scenario: Timer respects log level filtering
- **WHEN** `LOG_LEVEL` is `"warn"` and a timer end function is called with level `"debug"`
- **THEN** no output is written to stderr

### Requirement: LLM operation helper
The logger SHALL provide an `llm()` method that emits an `info`-level log entry with LLM-specific fields using the `gen_ai.*` namespace.

#### Scenario: Log LLM call with full telemetry
- **WHEN** `logger.llm("Slug generated", { "gen_ai.operation.name": "slugify", "gen_ai.request.model": "haiku", "gen_ai.usage.input_tokens": 42, "gen_ai.usage.output_tokens": 10, duration_ms: 1200 })` is called
- **THEN** a log entry is emitted at `INFO` level containing all provided `gen_ai.*` fields, `duration_ms`, and the standard base schema fields

#### Scenario: LLM helper with partial fields
- **WHEN** `logger.llm()` is called without token fields (only `gen_ai.operation.name` and `duration_ms`)
- **THEN** the log entry is emitted with the provided fields only; missing `gen_ai.*` fields are omitted, not set to null or zero

### Requirement: HTTP request duration logging
The API middleware SHALL log each completed HTTP request with OTel HTTP semantic convention fields: `http.request.method`, `url.path`, `http.response.status_code`, `http.server.request.duration`, and `request.id`.

#### Scenario: Successful API request
- **WHEN** a `GET /api/tasks` request completes with status 200
- **THEN** an `INFO`-level log entry is emitted containing `http.request.method` as `"GET"`, `url.path` as `"/api/tasks"`, `http.response.status_code` as `200`, `http.server.request.duration` as a positive number, and `request.id`

#### Scenario: Health check or static asset exclusion
- **WHEN** a request to a non-API path completes
- **THEN** no request duration log is emitted (only API routes are logged)

### Requirement: JSON Lines output to stderr
All log output SHALL be written as JSON Lines (one JSON object per line) to stderr via `console.error`. No other output targets SHALL be used.

#### Scenario: Each log call produces exactly one line
- **WHEN** `logger.info("A")` and `logger.warn("B")` are called sequentially
- **THEN** exactly two lines are written to stderr, each parseable as valid JSON
