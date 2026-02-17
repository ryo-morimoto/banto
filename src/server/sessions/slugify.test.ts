import { describe, it, expect, mock } from "bun:test";
import {
  simpleSlugify,
  isAsciiTitle,
  generateSlug,
  _generateSlugWithGenerator,
} from "./slugify.ts";
import type { SlugGenerator } from "./slugify.ts";

describe("simpleSlugify", () => {
  it("converts uppercase to lowercase", () => {
    expect(simpleSlugify("Fix Login Bug")).toBe("fix-login-bug");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(simpleSlugify("fix: login & signup")).toBe("fix-login-signup");
  });

  it("removes consecutive hyphens", () => {
    expect(simpleSlugify("fix---multiple---hyphens")).toBe("fix-multiple-hyphens");
  });

  it("trims leading and trailing hyphens", () => {
    expect(simpleSlugify("--fix-bug--")).toBe("fix-bug");
  });

  it("truncates to 30 characters", () => {
    const long = "this-is-a-very-long-title-that-exceeds-thirty-characters";
    const result = simpleSlugify(long);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result.endsWith("-")).toBe(false);
  });

  it("returns 'task' for empty string", () => {
    expect(simpleSlugify("")).toBe("task");
  });

  it("returns 'task' for whitespace-only string", () => {
    expect(simpleSlugify("   ")).toBe("task");
  });
});

describe("isAsciiTitle", () => {
  it("returns true for ASCII-only title", () => {
    expect(isAsciiTitle("Fix login bug")).toBe(true);
  });

  it("returns true for title with hyphens and underscores", () => {
    expect(isAsciiTitle("fix-login_bug")).toBe(true);
  });

  it("returns true for title with numbers", () => {
    expect(isAsciiTitle("Fix bug 123")).toBe(true);
  });

  it("returns false for Japanese title", () => {
    expect(isAsciiTitle("ログインバグを修正")).toBe(false);
  });

  it("returns false for mixed ASCII and non-ASCII", () => {
    expect(isAsciiTitle("Fix ログイン bug")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isAsciiTitle("")).toBe(false);
  });
});

describe("generateSlug", () => {
  it("returns simpleSlugify result for ASCII title without API call", async () => {
    const result = await generateSlug("Fix Login Bug");
    expect(result).toBe("fix-login-bug");
  });

  it("calls Haiku for non-ASCII title and returns slug", async () => {
    const mockGenerator: SlugGenerator = mock(() => Promise.resolve("fix-login-bug"));

    const result = await _generateSlugWithGenerator("ログインバグを修正", mockGenerator);
    expect(result).toBe("fix-login-bug");
    expect(mockGenerator).toHaveBeenCalledTimes(1);
  });

  it("returns 'task' when API call fails for non-ASCII title", async () => {
    const mockGenerator: SlugGenerator = mock(() => Promise.reject(new Error("API error")));

    const result = await _generateSlugWithGenerator("ログインバグを修正", mockGenerator);
    expect(result).toBe("task");
  });
});
