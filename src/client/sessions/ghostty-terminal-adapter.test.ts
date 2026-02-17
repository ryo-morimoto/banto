import { describe, expect, it } from "bun:test";
import { createGhosttyTerminalAdapterFromModule } from "./ghostty-terminal-adapter.ts";

interface Dimensions {
  cols: number;
  rows: number;
}

function createGhosttyModuleMock(proposedDimensions: Dimensions | undefined) {
  const state = {
    initCalls: 0,
    loadedAddons: [] as unknown[],
  };

  class TerminalMock {
    open(_element: HTMLElement) {}
    write(_data: string | Uint8Array) {}
    onData(_listener: (data: string) => void) {}
    loadAddon(addon: unknown) {
      state.loadedAddons.push(addon);
    }
    resize(_cols: number, _rows: number) {}
    dispose() {}
  }

  class FitAddonMock {
    activate(_terminal: unknown) {}
    dispose() {}
    proposeDimensions() {
      return proposedDimensions;
    }
  }

  return {
    state,
    ghostty: {
      init: async () => {
        state.initCalls += 1;
      },
      Terminal: TerminalMock,
      FitAddon: FitAddonMock,
    },
  };
}

describe("createGhosttyTerminalAdapterFromModule", () => {
  it("uses FitAddon dimensions for resize proposals", async () => {
    const expected = { cols: 92, rows: 31 };
    const { ghostty, state } = createGhosttyModuleMock(expected);
    const adapter = await createGhosttyTerminalAdapterFromModule(ghostty);

    adapter.open({} as HTMLElement);

    expect(state.initCalls).toBe(1);
    expect(state.loadedAddons).toHaveLength(1);
    expect(adapter.proposeDimensions()).toEqual(expected);
  });
});
