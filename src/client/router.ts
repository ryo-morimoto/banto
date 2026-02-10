import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/root.tsx";
import { indexRoute } from "./routes/index.tsx";
import { taskRoute } from "./routes/task.tsx";

const routeTree = rootRoute.addChildren([indexRoute, taskRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
