import { useEffect, useRef, useState } from "react";

type GhosttyTerminal = import("@nicolo-ribaudo/ghostty-web").Terminal;

interface TerminalViewProps {
  taskId: string;
  sessionStatus: string;
}

export function TerminalView({ taskId, sessionStatus }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<GhosttyTerminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isInteractive = sessionStatus !== "done" && sessionStatus !== "failed";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    // biome-ignore lint: refs are stable
    const el = container;
    let term: GhosttyTerminal | null = null;
    let ws: WebSocket | null = null;
    let resizeObserver: ResizeObserver | null = null;

    async function setup() {
      try {
        const ghostty = await import("@nicolo-ribaudo/ghostty-web");
        if (ghostty.init) await ghostty.init();

        if (cancelled || !el) return;

        term = new ghostty.Terminal({ fontSize: 14, cols: 120, rows: 40 });
        termRef.current = term;
        term.open(el);

        // Connect WebSocket
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${location.host}/api/tasks/${taskId}/terminal`);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onmessage = (e: MessageEvent<ArrayBuffer | string>) => {
          if (!term) return;
          if (e.data instanceof ArrayBuffer) {
            term.write(new Uint8Array(e.data));
          } else if (typeof e.data === "string") {
            term.write(e.data);
          }
        };

        ws.onerror = () => {
          setError("WebSocket connection error");
        };

        ws.onclose = () => {
          wsRef.current = null;
        };

        // Forward keystrokes (stdin) only for interactive sessions
        if (isInteractive) {
          term.onData((data: string) => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(data);
            }
          });
        }

        // Resize observer
        resizeObserver = new ResizeObserver(() => {
          if (!term) return;
          const dims = term.proposeDimensions?.();
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
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize terminal");
        }
      }
    }

    setup();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (ws) {
        ws.close();
        wsRef.current = null;
      }
      if (term) {
        term.dispose?.();
        termRef.current = null;
      }
    };
  }, [taskId, isInteractive]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
    );
  }

  return <div ref={containerRef} className="h-full w-full bg-black" />;
}
