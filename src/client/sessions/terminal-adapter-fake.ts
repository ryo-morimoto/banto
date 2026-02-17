import type { TerminalAdapter } from "./terminal-adapter.ts";

export function createFakeTerminalAdapter() {
  let dataListener: ((data: string) => void) | null = null;

  const adapter: TerminalAdapter & {
    writes: Array<string | Uint8Array>;
    emitted: string[];
    emitData(data: string): void;
  } = {
    writes: [],
    emitted: [],
    open() {},
    write(data) {
      this.writes.push(data);
    },
    onData(listener) {
      dataListener = listener;
      return () => {
        dataListener = null;
      };
    },
    proposeDimensions() {
      return { cols: 120, rows: 40 };
    },
    resize() {},
    dispose() {
      dataListener = null;
    },
    emitData(data) {
      this.emitted.push(data);
      dataListener?.(data);
    },
  };

  return adapter;
}
