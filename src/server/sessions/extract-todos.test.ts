import { describe, it, expect } from "bun:test";
import { extractTodosFromBlocks } from "./extract-todos.ts";

describe("extractTodosFromBlocks", () => {
  it("returns null when no TodoWrite block exists", () => {
    const blocks = [
      { type: "text", text: "I will implement this feature." },
      { type: "tool_use", id: "tu-1", name: "Bash", input: { command: "ls" } },
    ];

    expect(extractTodosFromBlocks(blocks)).toBeNull();
  });

  it("extracts todos from a TodoWrite tool_use block", () => {
    const blocks = [
      { type: "text", text: "Updating my todo list." },
      {
        type: "tool_use",
        id: "tu-1",
        name: "TodoWrite",
        input: {
          todos: [
            { content: "Write tests", status: "completed", activeForm: "Writing tests" },
            {
              content: "Implement feature",
              status: "in_progress",
              activeForm: "Implementing feature",
            },
            { content: "Refactor", status: "pending", activeForm: "Refactoring" },
          ],
        },
      },
    ];

    const result = extractTodosFromBlocks(blocks);

    expect(result).toHaveLength(3);
    expect(result![0]).toEqual({ content: "Write tests", status: "completed" });
    expect(result![1]).toEqual({ content: "Implement feature", status: "in_progress" });
    expect(result![2]).toEqual({ content: "Refactor", status: "pending" });
  });

  it("returns the last TodoWrite if multiple exist", () => {
    const blocks = [
      {
        type: "tool_use",
        id: "tu-1",
        name: "TodoWrite",
        input: {
          todos: [{ content: "Old task", status: "pending", activeForm: "Old" }],
        },
      },
      {
        type: "tool_use",
        id: "tu-2",
        name: "TodoWrite",
        input: {
          todos: [{ content: "New task", status: "in_progress", activeForm: "New" }],
        },
      },
    ];

    const result = extractTodosFromBlocks(blocks);

    expect(result).toHaveLength(1);
    expect(result![0]!.content).toBe("New task");
  });

  it("strips activeForm field from extracted todos", () => {
    const blocks = [
      {
        type: "tool_use",
        id: "tu-1",
        name: "TodoWrite",
        input: {
          todos: [{ content: "Task", status: "pending", activeForm: "Working" }],
        },
      },
    ];

    const result = extractTodosFromBlocks(blocks);
    const keys = Object.keys(result![0]!);

    expect(keys).toContain("content");
    expect(keys).toContain("status");
    expect(keys).not.toContain("activeForm");
  });
});
