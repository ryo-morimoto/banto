import { Elysia } from "elysia";
import { logger } from "./logger.ts";
import { projectRoutes } from "./projects/routes.ts";
import { taskRoutes } from "./tasks/routes.ts";
import { sessionRoutes } from "./sessions/routes.ts";
import { attachmentRoutes } from "./attachments/routes.ts";
import { errorRoutes } from "./errors/routes.ts";

export const apiApp = new Elysia({ prefix: "/api" })
  .derive(({ set }) => {
    const requestId = crypto.randomUUID();
    set.headers["x-request-id"] = requestId;
    return { requestId };
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

    logger[level](`${request.method} ${new URL(request.url).pathname} ${status}`, {
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
