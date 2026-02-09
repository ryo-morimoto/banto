import { useState, useEffect, useRef } from "react";

interface LogEntry {
  timestamp: string;
  type: "text" | "tool" | "error" | "status";
  content: string;
}

const typeColor: Record<string, string> = {
  text: "text-gray-700",
  tool: "text-blue-600",
  error: "text-red-600",
  status: "text-green-600",
};

export function SessionLog({ sessionId }: { sessionId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/logs/stream`);

    eventSource.onmessage = (event) => {
      const entry = JSON.parse(event.data) as LogEntry;
      setLogs((prev) => [...prev, entry]);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  if (logs.length === 0) {
    return <div className="text-xs text-gray-400 py-2">ログなし</div>;
  }

  return (
    <div className="max-h-64 overflow-y-auto bg-gray-900 rounded p-2 font-mono text-xs">
      {logs.map((entry, i) => (
        <div key={i} className={`py-0.5 ${typeColor[entry.type]}`}>
          <span className="text-gray-500 mr-2">
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
          {entry.type === "tool" && <span className="text-blue-400 mr-1">[tool]</span>}
          {entry.type === "error" && <span className="text-red-400 mr-1">[error]</span>}
          {entry.type === "status" && <span className="text-green-400 mr-1">[status]</span>}
          <span className="text-gray-200 whitespace-pre-wrap break-all">{entry.content}</span>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
