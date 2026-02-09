import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { app } from "./server/app.ts";

const server = new Elysia()
  .use(await staticPlugin({ prefix: "/", assets: "src/public" }))
  .use(app)
  .listen({ hostname: "0.0.0.0", port: 3000 });

console.log(`banto running at http://${server.server?.hostname}:${server.server?.port}`);
