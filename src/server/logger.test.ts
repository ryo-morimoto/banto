import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { logger } from "./logger.ts";

describe("logger", () => {
  let spy: ReturnType<typeof spyOn>;
  let output: string[];

  beforeEach(() => {
    output = [];
    spy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      output.push(String(args[0]));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("outputs JSON to stderr via console.error", () => {
    logger.info("hello");

    expect(output).toHaveLength(1);
    const entry = JSON.parse(output[0]!);
    expect(entry.level).toBe("info");
    expect(entry.msg).toBe("hello");
    expect(entry.ts).toBeDefined();
  });

  it("includes context fields in output", () => {
    logger.error("fail", { requestId: "abc-123", code: "NOT_FOUND" });

    const entry = JSON.parse(output[0]!);
    expect(entry.level).toBe("error");
    expect(entry.msg).toBe("fail");
    expect(entry.requestId).toBe("abc-123");
    expect(entry.code).toBe("NOT_FOUND");
  });

  it("supports warn level", () => {
    logger.warn("caution", { detail: "something" });

    const entry = JSON.parse(output[0]!);
    expect(entry.level).toBe("warn");
    expect(entry.msg).toBe("caution");
    expect(entry.detail).toBe("something");
  });

  it("produces valid ISO timestamp", () => {
    logger.info("ts-check");

    const entry = JSON.parse(output[0]!);
    const date = new Date(entry.ts);
    expect(date.toISOString()).toBe(entry.ts);
  });
});
