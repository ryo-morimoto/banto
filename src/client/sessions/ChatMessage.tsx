interface LogEntry {
  timestamp: string;
  type: "text" | "tool" | "error" | "status";
  content: string;
}

export function ChatMessage({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.timestamp).toLocaleTimeString();

  if (entry.type === "status") {
    return (
      <div className="flex justify-center py-1">
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {entry.content}
        </span>
      </div>
    );
  }

  if (entry.type === "error") {
    return (
      <div className="px-3 py-1.5">
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
          {entry.content}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{time}</div>
      </div>
    );
  }

  if (entry.type === "tool") {
    return (
      <div className="px-3 py-0.5">
        <div className="text-xs text-blue-500 font-mono">
          <span className="text-blue-400">[tool]</span> {entry.content}
        </div>
      </div>
    );
  }

  // text type - assistant message
  return (
    <div className="px-3 py-1.5">
      <div className="bg-gray-100 rounded-lg px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words max-w-[85%]">
        {entry.content}
      </div>
      <div className="text-xs text-gray-400 mt-0.5">{time}</div>
    </div>
  );
}
