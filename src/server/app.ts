import { Elysia } from "elysia";
import { logger } from "./logger.ts";
import { projectRoutes } from "./projects/routes.ts";
import { taskRoutes } from "./tasks/routes.ts";
import { sessionRoutes } from "./sessions/routes.ts";
import { attachmentRoutes } from "./attachments/routes.ts";
import { errorRoutes } from "./errors/routes.ts";

export function safePathname(url: string | undefined | null): string | null {
  if (!url) return null;
  return new URL(url).pathname;
}

export const apiApp = new Elysia({ prefix: "/api" })
  .derive(({ set }) => {
    const requestId = crypto.randomUUID();
    set.headers["x-request-id"] = requestId;
    return { requestId, requestStartMs: performance.now() };
  })
  .onAfterResponse(({ request, requestId, requestStartMs, set }) => {
    const pathname = safePathname(request.url);
    if (!pathname) return;
    logger.info(`${request.method} ${pathname} ${set.status ?? 200}`, {
      "request.id": requestId,
      "http.request.method": request.method,
      "url.path": pathname,
      "http.response.status_code": set.status ?? 200,
      "http.server.request.duration": performance.now() - requestStartMs,
    });
  })
  .onError(({ error, code, request, requestId, set }) => {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;

    const isNotFound =
      code === "NOT_FOUND" || (code === "UNKNOWN" && errMsg.toLowerCase().includes("not found"));
    const isValidation =
      code === "VALIDATION" || (code === "UNKNOWN" && errMsg.startsWith("Cannot "));
    const isConflict = code === "UNKNOWN" && errMsg.includes("already has an active session");

    const status = isConflict ? 409 : isNotFound ? 404 : isValidation ? 422 : 500;
    const level = status >= 500 ? "error" : "warn";

    logger[level](`${request.method} ${safePathname(request.url) ?? "unknown"} ${status}`, {
      requestId,
      code,
      error: errMsg,
      ...(status >= 500 && { stack: errStack }),
    });

    set.status = status;
    return {
      error: {
        message: status >= 500 ? "Internal server error" : errMsg,
        code: isConflict
          ? "CONFLICT"
          : isNotFound
            ? "NOT_FOUND"
            : isValidation
              ? "VALIDATION"
              : "INTERNAL",
        requestId,
      },
    };
  })
  .use(projectRoutes)
  .use(taskRoutes)
  .use(sessionRoutes)
  .use(attachmentRoutes)
  .use(errorRoutes);

export type App = typeof apiApp;
