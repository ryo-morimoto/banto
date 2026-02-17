import { describe, expect, it } from "bun:test";
import { imeFixtures } from "./ime-fixtures.ts";
import { createFakeTerminalAdapter } from "./terminal-adapter-fake.ts";
import { createTerminalInputBridge } from "./terminal-input-bridge.ts";

function createSocket() {
  return {
    readyState: 1,
    sent: [] as string[],
    send(payload: string) {
      this.sent.push(payload);
    },
  };
}

describe("createTerminalInputBridge", () => {
  it("forwards IME fixture commits to websocket sends", () => {
    const terminal = createFakeTerminalAdapter();
    const socket = createSocket();
    const bridge = createTerminalInputBridge({
      terminal,
      getSocket: () => socket,
      isInteractive: true,
    });

    const fixture = imeFixtures.find((item) => item.name === "mixed-latin-and-ime");
    expect(fixture).toBeDefined();

    for (const step of fixture!.steps) {
      bridge.handle(step);
    }

    expect(socket.sent).toEqual(fixture!.expectedWrites);
  });

  it("blocks keyboard and IME sends when session is done", () => {
    const terminal = createFakeTerminalAdapter();
    const socket = createSocket();
    const bridge = createTerminalInputBridge({
      terminal,
      getSocket: () => socket,
      isInteractive: false,
    });

    terminal.emitData("x");
    bridge.handle({ kind: "compositionstart" });
    bridge.handle({ kind: "compositionend", data: "日本" });
    bridge.handle({ kind: "input", data: "日本" });

    expect(socket.sent).toEqual([]);
  });

  it("blocks keyboard and IME sends when session is failed", () => {
    const terminal = createFakeTerminalAdapter();
    const socket = createSocket();
    const bridge = createTerminalInputBridge({
      terminal,
      getSocket: () => socket,
      isInteractive: false,
    });

    terminal.emitData("y");
    bridge.handle({ kind: "input", data: "z" });

    expect(socket.sent).toEqual([]);
  });

  it("forwards terminal keypress data for interactive sessions", () => {
    const terminal = createFakeTerminalAdapter();
    const socket = createSocket();
    const bridge = createTerminalInputBridge({
      terminal,
      getSocket: () => socket,
      isInteractive: true,
    });

    terminal.emitData("ls\n");

    expect(socket.sent).toEqual(["ls\n"]);
    bridge.dispose();
  });

  it("does not send when getSocket returns null", () => {
    const terminal = createFakeTerminalAdapter();
    const bridge = createTerminalInputBridge({
      terminal,
      getSocket: () => null,
      isInteractive: true,
    });

    terminal.emitData("hello");
    bridge.handle({ kind: "compositionend", data: "日本" });
    bridge.handle({ kind: "input", data: "日本" });

    // No socket → nothing sent, no error
  });

  it("uses latest socket from getter on each send", () => {
    const terminal = createFakeTerminalAdapter();
    const socket1 = createSocket();
    const socket2 = createSocket();
    let current: ReturnType<typeof createSocket> | null = socket1;

    const bridge = createTerminalInputBridge({
      terminal,
      getSocket: () => current,
      isInteractive: true,
    });

    terminal.emitData("a");
    expect(socket1.sent).toEqual(["a"]);
    expect(socket2.sent).toEqual([]);

    current = socket2;
    terminal.emitData("b");
    expect(socket1.sent).toEqual(["a"]);
    expect(socket2.sent).toEqual(["b"]);

    bridge.dispose();
  });
});
