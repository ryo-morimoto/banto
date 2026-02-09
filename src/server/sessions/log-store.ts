export interface LogEntry {
  timestamp: string;
  type: "text" | "tool" | "error" | "status";
  content: string;
}

type Listener = (entry: LogEntry) => void;

const logs = new Map<string, LogEntry[]>();
const listeners = new Map<string, Set<Listener>>();

export const logStore = {
  push(sessionId: string, entry: LogEntry) {
    if (!logs.has(sessionId)) logs.set(sessionId, []);
    logs.get(sessionId)!.push(entry);
    const subs = listeners.get(sessionId);
    if (subs) {
      for (const fn of subs) fn(entry);
    }
  },

  getAll(sessionId: string): LogEntry[] {
    return logs.get(sessionId) ?? [];
  },

  subscribe(sessionId: string, fn: Listener): () => void {
    if (!listeners.has(sessionId)) listeners.set(sessionId, new Set());
    listeners.get(sessionId)!.add(fn);
    return () => {
      listeners.get(sessionId)?.delete(fn);
    };
  },

  clear(sessionId: string) {
    logs.delete(sessionId);
    listeners.delete(sessionId);
  },
};
