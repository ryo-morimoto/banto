import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "../../shared/types.ts";
import { sessionQueries, useStartSession } from "./queries.ts";
import { ChatMessage } from "./ChatMessage.tsx";

interface LogEntry {
  timestamp: string;
  type: "text" | "tool" | "error" | "status";
  content: string;
}

function isActiveSession(status: string) {
  return (
    status === "pending" ||
    status === "provisioning" ||
    status === "running" ||
    status === "waiting_for_input"
  );
}

export function SessionChatPanel({ task }: { task: Task }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionsQuery = useQuery(sessionQueries.byTask(task.id));
  const startSessionMutation = useStartSession();
  const session = sessionsQuery.data?.[0] ?? null;
  const activeSessionId = session && isActiveSession(session.status) ? session.id : null;

  // SSE connection for active sessions
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    setLogs([]);
    const eventSource = new EventSource(`/api/sessions/${activeSessionId}/logs/stream`);

    eventSource.onmessage = (event) => {
      const entry = JSON.parse(event.data) as LogEntry;
      setLogs((prev) => [...prev, entry]);
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeSessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Reset logs when session changes
  useEffect(() => {
    if (!session || !isActiveSession(session.status)) {
      setLogs([]);
    }
  }, [session?.id]);

  function handleStartSession() {
    startSessionMutation.mutate(task.id);
  }

  // No session state
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <div className="text-sm">セッションなし</div>
        {task.status === "active" && (
          <button
            type="button"
            onClick={handleStartSession}
            disabled={startSessionMutation.isPending}
            className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded disabled:opacity-50"
          >
            セッション開始
          </button>
        )}
      </div>
    );
  }

  // Pending / provisioning
  if (session.status === "pending" || session.status === "provisioning") {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 gap-2">
        <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full" />
        <span className="text-sm">準備中...</span>
      </div>
    );
  }

  // Running / done / failed - show log messages
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-white">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              session.status === "running"
                ? "bg-blue-500 animate-pulse"
                : session.status === "done"
                  ? "bg-green-500"
                  : "bg-red-500"
            }`}
          />
          <span className="text-xs font-mono text-gray-500">{session.status}</span>
          {"branch" in session && session.branch && (
            <span className="text-xs text-gray-400">{session.branch}</span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-2">
        {logs.length === 0 && session.status === "running" && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            実行中...
          </div>
        )}
        {logs.map((entry, i) => (
          <ChatMessage key={i} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Footer for done/failed */}
      {(session.status === "done" || session.status === "failed") && (
        <div className="px-3 py-2 border-t bg-white">
          {"error" in session && session.error && (
            <div className="text-xs text-red-500 mb-2">{session.error}</div>
          )}
          {task.status === "active" && (
            <button
              type="button"
              onClick={handleStartSession}
              className="text-xs bg-purple-600 text-white px-4 py-1.5 rounded"
            >
              再実行
            </button>
          )}
        </div>
      )}
    </div>
  );
}
