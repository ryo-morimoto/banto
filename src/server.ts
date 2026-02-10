import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { apiApp } from "./server/app.ts";

const app = new Elysia()
  .use(apiApp)
  .use(await staticPlugin({ prefix: "/" }))
  .listen({ hostname: "0.0.0.0", port: 3000 });

console.log(`banto running at http://${app.server!.hostname}:${app.server!.port}`);
