import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { apiApp } from "./server/app.ts";
import { logger } from "./server/logger.ts";

const app = new Elysia()
  .use(apiApp)
  .use(await staticPlugin({ prefix: "/" }))
  .get("*", ({ path }) => {
    if (path.startsWith("/api")) {
      return new Response(null, { status: 404 });
    }
    return Bun.file("public/index.html");
  })
  .listen({ hostname: "0.0.0.0", port: Number(process.env.PORT || 3000) });

logger.info("Server started", { host: app.server!.hostname, port: app.server!.port });
