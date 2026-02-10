type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

function log(level: LogLevel, msg: string, context?: Record<string, unknown>) {
  const entry: LogEntry = { ts: new Date().toISOString(), level, msg, ...context };
  console.error(JSON.stringify(entry));
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
};
