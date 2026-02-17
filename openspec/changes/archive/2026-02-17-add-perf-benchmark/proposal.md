## Why

The current logger (`logger.ts`) is a 19-line minimal wrapper — `info`/`warn`/`error` with flat JSON output. It has no `debug` level, no duration measurement, no consistent field naming convention, and no way to attach structured context across an operation's lifecycle. As the application grows (LLM calls, session management, API requests), we need a logging foundation that follows established guidelines before instrumentation becomes ad-hoc.

The [future-architect log guidelines](https://github.com/future-architect/arch-guidelines/blob/main/documents/forLog/log_guidelines.md) prescribe: RFC 5424 severity levels, JSON Lines format, OpenTelemetry Semantic Conventions for field naming, operation duration tracking, and environment-aware log level filtering. The current logger satisfies almost none of these.

## What Changes

- Rebuild the structured logger on the design guidelines: full log levels (`debug`/`info`/`warn`/`error`), environment-aware level filtering, field naming aligned to OpenTelemetry Semantic Conventions, and consistent base schema (`timestamp`, `severity`, `message`, `service.name`)
- Add a timer primitive for measuring arbitrary operation durations — any code path can start a timer and emit a structured log with `duration_ms` on completion
- Add an LLM operation log helper as a specialized timer that also captures `model`, `input_tokens`, `output_tokens`, `total_tokens`, and `estimated_cost_usd`
- Add request duration logging to the Elysia API middleware as the first infrastructure-level consumer
- Instrument existing LLM call sites (`slugify.ts`, `runner.ts`) as the first domain-level consumers

## Capabilities

### New Capabilities

- `structured-logging`: Logging foundation aligned to the design guidelines — log levels, environment-aware filtering, OpenTelemetry-convention field naming, base schema, timer primitive for duration measurement, and LLM operation helper. Replaces the current minimal `logger.ts`.

### Modified Capabilities

None

## Impact

- **Existing call sites**: `logger.info`/`warn`/`error` API remains backward-compatible. No changes required to existing code
- **Dependencies**: None. Uses `performance.now()` for high-resolution timing
- **Schema**: No DB changes. Logging is output-only
- **Log output**: JSON Lines to stderr (unchanged transport). Field names shift to OpenTelemetry Semantic Conventions
