import { Elysia, t } from "elysia";
import { logger } from "../logger.ts";

export const errorRoutes = new Elysia({ prefix: "/errors" }).post(
  "/",
  ({ body }) => {
    logger.error("Client error", {
      source: "client",
      ...body,
    });
    return { ok: true };
  },
  {
    body: t.Object({
      message: t.String(),
      stack: t.Optional(t.String()),
      requestId: t.Optional(t.String()),
      url: t.String(),
    }),
  },
);
