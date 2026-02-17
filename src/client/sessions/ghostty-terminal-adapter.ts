import type { TerminalAdapter } from "./terminal-adapter.ts";

interface GhosttyFitAddon {
  activate(terminal: unknown): void;
  dispose(): void;
  proposeDimensions(): { cols: number; rows: number } | undefined;
}

interface GhosttyTerminal {
  open(element: HTMLElement): void;
  write(data: string | Uint8Array): void;
  onData(listener: (data: string) => void): void;
  loadAddon(addon: GhosttyFitAddon): void;
  resize(cols: number, rows: number): void;
  dispose?(): void;
}

interface GhosttyModule {
  init?: () => Promise<void>;
  Terminal: new (options?: import("ghostty-web").ITerminalOptions) => GhosttyTerminal;
  FitAddon: new () => GhosttyFitAddon;
}

class GhosttyTerminalAdapter implements TerminalAdapter {
  private readonly term: GhosttyTerminal;
  private readonly fitAddon: GhosttyFitAddon;

  constructor(term: GhosttyTerminal, fitAddon: GhosttyFitAddon) {
    this.term = term;
    this.fitAddon = fitAddon;
  }

  open(element: HTMLElement) {
    this.term.open(element);
    this.term.loadAddon(this.fitAddon);
  }

  write(data: string | Uint8Array) {
    this.term.write(data);
  }

  onData(listener: (data: string) => void) {
    this.term.onData(listener);
    return () => {};
  }

  proposeDimensions() {
    return this.fitAddon.proposeDimensions() ?? null;
  }

  resize(cols: number, rows: number) {
    this.term.resize(cols, rows);
  }

  dispose() {
    this.fitAddon.dispose();
    this.term.dispose?.();
  }
}

export async function createGhosttyTerminalAdapterFromModule(ghostty: GhosttyModule) {
  if (ghostty.init) await ghostty.init();

  const terminal = new ghostty.Terminal({
    fontSize: 14,
    cols: 120,
    rows: 40,
    theme: {
      foreground: "#d4d4d4",
      background: "#1e1e1e",
      cursor: "#ffffff",
      black: "#000000",
      red: "#cd3131",
      green: "#0dbc79",
      yellow: "#e5e510",
      blue: "#2472c8",
      magenta: "#bc3fbc",
      cyan: "#11a8cd",
      white: "#e5e5e5",
      brightBlack: "#666666",
      brightRed: "#f14c4c",
      brightGreen: "#23d18b",
      brightYellow: "#f5f543",
      brightBlue: "#3b8eea",
      brightMagenta: "#d670d6",
      brightCyan: "#29b8db",
      brightWhite: "#ffffff",
    },
  });
  const fitAddon = new ghostty.FitAddon();
  return new GhosttyTerminalAdapter(terminal, fitAddon);
}

export async function createGhosttyTerminalAdapter() {
  const ghostty: GhosttyModule = await import("ghostty-web");
  return createGhosttyTerminalAdapterFromModule(ghostty);
}
