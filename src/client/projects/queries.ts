import { queryOptions } from "@tanstack/react-query";
import { listProjects } from "./api.ts";

export const projectQueries = {
  all: () => ["projects"] as const,
  list: () =>
    queryOptions({
      queryKey: [...projectQueries.all(), "list"] as const,
      queryFn: listProjects,
      staleTime: 5 * 60 * 1000,
    }),
};
