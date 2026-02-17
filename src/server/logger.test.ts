import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { createLogger } from "./logger.ts";

function setupLogger(env: Record<string, string> = {}) {
  const output: string[] = [];
  const spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    output.push(String(args[0]));
  });
  const logger = createLogger(env);
  return { logger, output, spy };
}

describe("logger base schema", () => {
  let spy: ReturnType<typeof spyOn>;
  let output: string[];
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    ({ logger, output, spy } = setupLogger());
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("includes OTel base fields in every entry", () => {
    logger.info("hello");

    expect(output).toHaveLength(1);
    const entry = JSON.parse(output[0]!);
    expect(entry["severity.text"]).toBe("INFO");
    expect(entry.message).toBe("hello");
    expect(entry["service.name"]).toBe("banto");
    expect(entry["deployment.environment"]).toBeDefined();
    expect(entry.timestamp).toBeDefined();
  });

  it("produces valid ISO 8601 timestamp", () => {
    logger.info("ts-check");

    const entry = JSON.parse(output[0]!);
    const date = new Date(entry.timestamp);
    expect(date.toISOString()).toBe(entry.timestamp);
  });

  it("includes context fields in output", () => {
    logger.error("fail", { requestId: "abc-123", code: "NOT_FOUND" });

    const entry = JSON.parse(output[0]!);
    expect(entry["severity.text"]).toBe("ERROR");
    expect(entry.message).toBe("fail");
    expect(entry.requestId).toBe("abc-123");
    expect(entry.code).toBe("NOT_FOUND");
  });

  it("base fields take precedence over context", () => {
    logger.info("test", { timestamp: "fake", "severity.text": "FAKE" });

    const entry = JSON.parse(output[0]!);
    expect(entry["severity.text"]).toBe("INFO");
    expect(entry.timestamp).not.toBe("fake");
  });
});

describe("logger level filtering", () => {
  afterEach(() => {
    // Each test creates its own spy via setupLogger
  });

  it("emits debug when LOG_LEVEL is debug", () => {
    const { logger, output, spy } = setupLogger({ LOG_LEVEL: "debug" });
    logger.debug("detail");
    spy.mockRestore();

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!)["severity.text"]).toBe("DEBUG");
  });

  it("suppresses debug when LOG_LEVEL is info", () => {
    const { logger, output, spy } = setupLogger({ LOG_LEVEL: "info" });
    logger.debug("detail");
    spy.mockRestore();

    expect(output).toHaveLength(0);
  });

  it("emits warn and error when LOG_LEVEL is warn", () => {
    const { logger, output, spy } = setupLogger({ LOG_LEVEL: "warn" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    spy.mockRestore();

    expect(output).toHaveLength(2);
    expect(JSON.parse(output[0]!)["severity.text"]).toBe("WARN");
    expect(JSON.parse(output[1]!)["severity.text"]).toBe("ERROR");
  });

  it("defaults to debug when LOG_LEVEL is not set", () => {
    const { logger, output, spy } = setupLogger({});
    logger.debug("should appear");
    spy.mockRestore();

    expect(output).toHaveLength(1);
  });
});

describe("startTimer", () => {
  it("emits duration_ms as a non-negative number", () => {
    const { logger, output, spy } = setupLogger();
    const end = logger.startTimer();
    end("info", "Op done", { op: "test" });
    spy.mockRestore();

    expect(output).toHaveLength(1);
    const entry = JSON.parse(output[0]!);
    expect(entry["severity.text"]).toBe("INFO");
    expect(entry.message).toBe("Op done");
    expect(entry.op).toBe("test");
    expect(typeof entry.duration_ms).toBe("number");
    expect(entry.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("respects log level filtering", () => {
    const { logger, output, spy } = setupLogger({ LOG_LEVEL: "warn" });
    const end = logger.startTimer();
    end("debug", "filtered");
    spy.mockRestore();

    expect(output).toHaveLength(0);
  });
});

describe("llm", () => {
  it("emits info-level entry with gen_ai fields", () => {
    const { logger, output, spy } = setupLogger();
    logger.llm("Slug generated", {
      "gen_ai.operation.name": "slugify",
      "gen_ai.request.model": "haiku",
      "gen_ai.usage.input_tokens": 42,
      "gen_ai.usage.output_tokens": 10,
      duration_ms: 1200,
    });
    spy.mockRestore();

    expect(output).toHaveLength(1);
    const entry = JSON.parse(output[0]!);
    expect(entry["severity.text"]).toBe("INFO");
    expect(entry.message).toBe("Slug generated");
    expect(entry["gen_ai.operation.name"]).toBe("slugify");
    expect(entry["gen_ai.request.model"]).toBe("haiku");
    expect(entry["gen_ai.usage.input_tokens"]).toBe(42);
    expect(entry["gen_ai.usage.output_tokens"]).toBe(10);
    expect(entry.duration_ms).toBe(1200);
  });

  it("omits missing gen_ai fields rather than setting null", () => {
    const { logger, output, spy } = setupLogger();
    logger.llm("Partial", {
      "gen_ai.operation.name": "test",
      duration_ms: 500,
    });
    spy.mockRestore();

    const entry = JSON.parse(output[0]!);
    expect(entry["gen_ai.operation.name"]).toBe("test");
    expect(entry.duration_ms).toBe(500);
    expect("gen_ai.usage.input_tokens" in entry).toBe(false);
    expect("gen_ai.request.model" in entry).toBe(false);
  });
});
