import { queryOptions, keepPreviousData } from "@tanstack/react-query";
import { listActiveTasks, listBacklogTasks, listPinnedTasks, getTask } from "./api.ts";

export const taskQueries = {
  all: () => ["tasks"] as const,
  lists: () => [...taskQueries.all(), "list"] as const,
  active: () =>
    queryOptions({
      queryKey: [...taskQueries.lists(), "active"] as const,
      queryFn: listActiveTasks,
      refetchInterval: 5000,
    }),
  backlog: () =>
    queryOptions({
      queryKey: [...taskQueries.lists(), "backlog"] as const,
      queryFn: listBacklogTasks,
      refetchInterval: 5000,
    }),
  pinned: () =>
    queryOptions({
      queryKey: [...taskQueries.lists(), "pinned"] as const,
      queryFn: listPinnedTasks,
      refetchInterval: 5000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...taskQueries.all(), "detail", id] as const,
      queryFn: () => getTask(id),
      placeholderData: keepPreviousData,
    }),
};
