import { queryOptions } from "@tanstack/react-query";
import type { Session } from "../../shared/types.ts";
import { listSessionsByTask } from "./api.ts";

function hasActiveSession(sessions: Session[]): boolean {
  return sessions.some(
    (s) =>
      s.status === "pending" ||
      s.status === "provisioning" ||
      s.status === "running" ||
      s.status === "waiting_for_input",
  );
}

export const sessionQueries = {
  all: () => ["sessions"] as const,
  byTask: (taskId: string) =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "byTask", taskId] as const,
      queryFn: () => listSessionsByTask(taskId),
      refetchInterval: (query) => {
        const sessions = query.state.data;
        return sessions && hasActiveSession(sessions) ? 2000 : false;
      },
    }),
};
