import { useEffect, useRef, useState } from "react";
import { createGhosttyTerminalAdapter } from "./ghostty-terminal-adapter.ts";
import type { TerminalAdapter } from "./terminal-adapter.ts";
import { createTerminalInputBridge } from "./terminal-input-bridge.ts";

interface TerminalViewProps {
  taskId: string;
  sessionStatus: string;
}

const MAX_RETRIES = 10;

export function TerminalView({ taskId, sessionStatus }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<TerminalAdapter | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const isInteractive = sessionStatus !== "done" && sessionStatus !== "failed";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    // biome-ignore lint: refs are stable
    const el = container;
    let term: TerminalAdapter | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupInputBridge: (() => void) | null = null;

    function connectWs() {
      if (cancelled || !term) return;

      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/api/tasks/${taskId}/terminal`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        retryCountRef.current = 0;
        setReconnecting(false);
        // Clear terminal before server sends replay buffer
        term?.write("\x1b[2J\x1b[H");
      };

      ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
        if (!term) return;
        if (e.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(e.data));
        } else if (typeof e.data === "string") {
          term.write(e.data);
        }
      };

      ws.onerror = () => {
        // onclose fires after onerror — reconnect is handled there
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (cancelled) return;

        // Don't reconnect for intentional closes or terminal session states
        const isIntentionalClose = event.code === 1000 || event.code === 4404;
        const isSessionEnded = sessionStatus === "done" || sessionStatus === "failed";

        if (!isIntentionalClose && !isSessionEnded && retryCountRef.current < MAX_RETRIES) {
          setReconnecting(true);
          const delay = Math.min(1000 * 2 ** retryCountRef.current, 30000);
          retryCountRef.current += 1;
          retryTimerRef.current = setTimeout(connectWs, delay);
        } else if (retryCountRef.current >= MAX_RETRIES) {
          setReconnecting(false);
          setError("Connection lost");
        }
      };
    }

    async function setup() {
      try {
        if (cancelled || !el) return;

        term = await createGhosttyTerminalAdapter();
        termRef.current = term;
        term.open(el);

        const inputBridge = createTerminalInputBridge({
          terminal: term,
          getSocket: () => wsRef.current,
          isInteractive,
        });

        const onCompositionStart = () => {
          inputBridge.handle({ kind: "compositionstart" });
        };
        const onCompositionUpdate = (event: CompositionEvent) => {
          inputBridge.handle({ kind: "compositionupdate", data: event.data ?? "" });
        };
        const onCompositionEnd = (event: CompositionEvent) => {
          inputBridge.handle({ kind: "compositionend", data: event.data ?? "" });
        };
        const onInput = (event: Event) => {
          const inputEvent = event as InputEvent;
          inputBridge.handle({ kind: "input", data: inputEvent.data ?? "" });
        };

        el.addEventListener("compositionstart", onCompositionStart);
        el.addEventListener("compositionupdate", onCompositionUpdate);
        el.addEventListener("compositionend", onCompositionEnd);
        el.addEventListener("input", onInput);

        cleanupInputBridge = () => {
          inputBridge.dispose();
          el.removeEventListener("compositionstart", onCompositionStart);
          el.removeEventListener("compositionupdate", onCompositionUpdate);
          el.removeEventListener("compositionend", onCompositionEnd);
          el.removeEventListener("input", onInput);
        };

        // Resize observer
        resizeObserver = new ResizeObserver(() => {
          if (!term) return;
          const dims = term.proposeDimensions();
          if (dims) {
            term.resize(dims.cols, dims.rows);
            fetch(`/api/tasks/${taskId}/terminal/resize`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cols: dims.cols, rows: dims.rows }),
            }).catch(() => {});
          }
        });
        resizeObserver.observe(el);

        connectWs();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize terminal");
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      cleanupInputBridge?.();
      resizeObserver?.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (term) {
        term.dispose();
        termRef.current = null;
      }
    };
  }, [taskId, isInteractive]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {reconnecting && (
        <div className="absolute top-0 left-0 right-0 z-10 bg-yellow-900/80 text-yellow-200 text-xs text-center py-1">
          Reconnecting...
        </div>
      )}
      <div ref={containerRef} className="h-full w-full bg-black" tabIndex={0} />
    </div>
  );
}
