## Context

The current logger (`src/server/logger.ts`) is a 19-line module exporting `logger.info`/`warn`/`error`. It outputs JSON Lines to stderr with fields `ts`, `level`, `msg`, plus ad-hoc context spread. There is no `debug` level, no environment-aware filtering, no standard field naming, no duration measurement, and no way to capture LLM-specific telemetry (tokens, cost).

The [future-architect log guidelines](https://github.com/future-architect/arch-guidelines/blob/main/documents/forLog/log_guidelines.md) define a comprehensive logging standard based on OpenTelemetry Semantic Conventions. The current logger deviates in field names (`ts` vs `timestamp`, `level` vs `severity.text`, `msg` vs `message`), missing base schema fields (`service.name`, `deployment.environment`), missing levels, and no structured duration tracking.

This is a single-service application running on a NixOS mini PC. There is no distributed tracing need — `trace_id`/`span_id` are not applicable. The guidelines' batch processing and message code patterns are also out of scope for now.

## Goals / Non-Goals

**Goals:**
- Align the logger to the design guidelines: OTel field naming, full severity levels, environment-aware filtering, JSON Lines output
- Provide a timer primitive usable anywhere for `duration_ms` measurement
- Provide an LLM operation helper that extends the timer with `gen_ai.*` fields (model, tokens, cost)
- Add HTTP request/response duration logging via Elysia middleware
- Maintain backward compatibility: `logger.info(msg, ctx)` call signature continues to work

**Non-Goals:**
- Distributed tracing (`trace_id`, `span_id`) — single-service, no need
- FATAL/TRACE levels — guidelines recommend applications use DEBUG–ERROR only
- Message codes (WARN+ runbook linkage) — premature for current scale
- Log aggregation or shipping — out of scope, stdout/stderr is sufficient
- Async logging / buffered appender — Bun's I/O is already non-blocking for console output
- Platform-specific field mapping (CloudWatch, DataDog adapters)

## Decisions

### 1. Field naming: OTel Semantic Conventions

Rename existing fields to match the guidelines:

| Current | New (OTel) |
|---------|------------|
| `ts` | `timestamp` |
| `level` | `severity.text` |
| `msg` | `message` |
| _(none)_ | `service.name` |
| _(none)_ | `deployment.environment` |

**Why**: The guidelines explicitly prescribe OTel conventions. Since we control all log consumers (manual inspection + future jq/grep), renaming now avoids a harder migration later.

**Alternative considered**: Keep current names, add OTel aliases. Rejected — dual naming creates confusion and the consumer base is zero (no dashboards, no alerts).

### 2. Log levels: `debug` / `info` / `warn` / `error`

Add `debug`. Skip `trace` and `fatal` per the guidelines' recommendation that applications use DEBUG–ERROR.

Environment filtering via `LOG_LEVEL` env var:
- `development` (default): `debug` and above
- `production`: `info` and above

**Why**: `debug` is needed for performance instrumentation output that should not appear in production. A single env var keeps configuration minimal.

### 3. Timer primitive: `logger.startTimer()`

API:

```typescript
const end = logger.startTimer();
// ... operation ...
end("info", "Slug generated", { operation: "slugify" });
```

`startTimer()` captures `performance.now()` and returns a function that, when called, computes `duration_ms` and emits a log entry with the duration included.

**Why**: This is the simplest API that covers the "measure any operation" requirement. No span objects, no context propagation, no nesting. A closure over a start timestamp.

**Alternative considered**: A `withTimer(fn)` wrapper that auto-logs on return. Rejected — it forces all timed operations into a callback, which doesn't compose well with the existing imperative code in `runner.ts` (multi-step session lifecycle across async callbacks).

### 4. LLM operation helper: `logger.llm()`

API:

```typescript
logger.llm("Slug generation completed", {
  "gen_ai.operation.name": "slugify",
  "gen_ai.request.model": "haiku",
  "gen_ai.usage.input_tokens": 42,
  "gen_ai.usage.output_tokens": 10,
  "gen_ai.usage.total_tokens": 52,
  "gen_ai.estimated_cost_usd": 0.0001,
  duration_ms: 1234,
});
```

Uses `gen_ai.*` namespace from the [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/). Logs at `info` level. The `duration_ms` field is manually passed (typically obtained from a `startTimer()` call).

**Why**: Separating the LLM helper from the timer keeps both primitives simple. The caller composes them rather than the logger coupling them.

**Alternative considered**: Auto-extracting token counts from the Agent SDK response inside the logger. Rejected — the logger should not know about SDK response shapes. Extraction belongs in the call site (`slugify.ts`).

### 5. HTTP request duration: Elysia `onAfterResponse` hook

Add `onAfterResponse` to `apiApp` that logs:

```json
{
  "timestamp": "...",
  "severity.text": "INFO",
  "message": "GET /api/tasks 200",
  "service.name": "banto",
  "request.id": "uuid",
  "http.request.method": "GET",
  "url.path": "/api/tasks",
  "http.response.status_code": 200,
  "http.server.request.duration": 12.5
}
```

Field names follow the guidelines' HTTP access log schema. Duration is measured from `derive` (request start) to `onAfterResponse`.

**Why**: The guidelines recommend logging both request and response. A single response-time log with all fields is sufficient for a single-service app — separate request/response logs add noise without distributed tracing benefit.

### 6. Base schema injection via shared config

A `logConfig` object holds `service.name` and `deployment.environment`, read once at startup from env vars (with defaults: `"banto"` and `"development"`). The `log()` function merges these into every entry.

**Why**: Avoids repeating base fields at every call site. Centralized config is easy to change.

## Risks / Trade-offs

**Field name rename breaks existing log queries** → The current consumer base is manual `jq` inspection only. No dashboards or alerts exist. Risk is negligible. If needed, a one-time search-replace in any analysis scripts.

**`performance.now()` precision varies across runtimes** → Bun provides sub-millisecond precision, which is sufficient. Not a real risk.

**Agent SDK `query()` does not expose token usage in `result` messages** → If `total_cost_usd` and token fields are not available from the SDK response, the LLM helper will log `duration_ms` only, with token fields omitted. The timer still provides the primary performance signal. This needs verification during implementation.
