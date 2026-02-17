## 1. Logger Foundation

- [x] 1.1 Rebuild `logger.ts`: OTel base schema (`timestamp`, `severity.text`, `message`, `service.name`, `deployment.environment`), four levels (`debug`/`info`/`warn`/`error`), `LOG_LEVEL` env var filtering
- [x] 1.2 Rebuild `logger.test.ts`: base schema fields, level filtering, context field handling, base field precedence over context

## 2. Timer & LLM Helper

- [x] 2.1 Add `startTimer()` to logger: returns end function that emits `duration_ms`, respects level filtering
- [x] 2.2 Add `llm()` to logger: `info`-level entry with `gen_ai.*` fields, omit missing fields
- [x] 2.3 Add tests for `startTimer()` and `llm()`

## 3. HTTP Request Duration Middleware

- [x] 3.1 Add `onAfterResponse` hook to `apiApp` in `app.ts`: log `http.request.method`, `url.path`, `http.response.status_code`, `http.server.request.duration`, `request.id`
- [x] 3.2 Capture request start time in `derive` for duration calculation

## 4. Instrument Existing Call Sites

- [x] 4.1 Instrument `slugify.ts` `queryHaiku`: timer + `logger.llm()` with available Agent SDK fields
- [x] 4.2 Instrument `runner.ts` session lifecycle: timer from `startSession` to done/failed

## 5. Migrate Existing Call Sites

- [x] 5.1 Update all existing `logger.*` calls to use new field names if needed (verify backward compatibility)
