import type { TerminalAdapter } from "./terminal-adapter.ts";

type GhosttyModule = typeof import("ghostty-web");
type GhosttyTerminal = import("ghostty-web").Terminal;

class GhosttyTerminalAdapter implements TerminalAdapter {
  private readonly term: GhosttyTerminal;

  constructor(term: GhosttyTerminal) {
    this.term = term;
  }

  open(element: HTMLElement) {
    this.term.open(element);
  }

  write(data: string | Uint8Array) {
    this.term.write(data);
  }

  onData(listener: (data: string) => void) {
    this.term.onData(listener);
    return () => {};
  }

  proposeDimensions() {
    return this.term.proposeDimensions?.() ?? null;
  }

  resize(cols: number, rows: number) {
    this.term.resize(cols, rows);
  }

  dispose() {
    this.term.dispose?.();
  }
}

export async function createGhosttyTerminalAdapter() {
  const ghostty: GhosttyModule = await import("ghostty-web");
  if (ghostty.init) await ghostty.init();

  const terminal = new ghostty.Terminal({ fontSize: 14, cols: 120, rows: 40 });
  return new GhosttyTerminalAdapter(terminal);
}
