type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

interface LogEntry {
  timestamp: string;
  "severity.text": string;
  message: string;
  "service.name": string;
  "deployment.environment": string;
  [key: string]: unknown;
}

export function createLogger(env: Record<string, string> = process.env as Record<string, string>) {
  const minLevel = LEVEL_PRIORITY[(env.LOG_LEVEL as LogLevel) ?? "debug"] ?? LEVEL_PRIORITY.debug;
  const serviceName = env.SERVICE_NAME ?? "banto";
  const environment = env.DEPLOYMENT_ENV ?? env.NODE_ENV ?? "development";

  function log(level: LogLevel, msg: string, context?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[level] < minLevel) return;

    const entry: LogEntry = {
      ...context,
      timestamp: new Date().toISOString(),
      "severity.text": level.toUpperCase(),
      message: msg,
      "service.name": serviceName,
      "deployment.environment": environment,
    };
    console.error(JSON.stringify(entry));
  }

  function startTimer() {
    const start = performance.now();
    return (level: LogLevel, msg: string, ctx?: Record<string, unknown>) => {
      log(level, msg, { ...ctx, duration_ms: performance.now() - start });
    };
  }

  function llm(msg: string, ctx: Record<string, unknown>) {
    log("info", msg, ctx);
  }

  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
    startTimer,
    llm,
  };
}

export const logger = createLogger();
