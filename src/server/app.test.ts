import { describe, it, expect } from "bun:test";
import { safePathname } from "./app.ts";

describe("safePathname", () => {
  it("extracts pathname from a valid URL", () => {
    expect(safePathname("http://localhost:3000/api/tasks")).toBe("/api/tasks");
  });

  it("returns null for empty string", () => {
    expect(safePathname("")).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(safePathname(undefined)).toBeNull();
  });

  it("returns null for null", () => {
    expect(safePathname(null)).toBeNull();
  });
});
