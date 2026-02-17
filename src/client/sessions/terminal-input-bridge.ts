import { createImeController, type ImeControllerEvent } from "./ime-controller.ts";
import type { TerminalAdapter } from "./terminal-adapter.ts";

const OPEN_SOCKET = 1;

interface SocketLike {
  readyState: number;
  send(payload: string): void;
}

interface CreateTerminalInputBridgeParams {
  terminal: TerminalAdapter;
  getSocket: () => SocketLike | null;
  isInteractive: boolean;
}

export function createTerminalInputBridge({
  terminal,
  getSocket,
  isInteractive,
}: CreateTerminalInputBridgeParams) {
  const sendIfAllowed = (payload: string) => {
    if (!isInteractive) return;
    const sock = getSocket();
    if (!sock || sock.readyState !== OPEN_SOCKET) return;
    sock.send(payload);
  };

  const imeController = createImeController(sendIfAllowed);
  const disposeOnData = terminal.onData(sendIfAllowed);

  return {
    handle(event: ImeControllerEvent) {
      imeController.handle(event);
    },
    dispose() {
      disposeOnData();
    },
  };
}
