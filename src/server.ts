import homepage from "./public/index.html";
import { app } from "./server/app.ts";

const server = Bun.serve({
  routes: {
    "/": homepage,
  },
  fetch: (req) => app.fetch(req),
  hostname: "0.0.0.0",
  port: 3000,
  development: process.env.NODE_ENV !== "production",
});

console.log(`banto running at http://${server.hostname}:${server.port}`);
