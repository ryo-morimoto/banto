import { queryOptions, keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listActiveTasks,
  listBacklogTasks,
  listPinnedTasks,
  getTask,
  createTask,
  activateTask,
  completeTask,
  reopenTask,
  pinTask,
  unpinTask,
  updateTaskDescription,
} from "./api.ts";

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

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTask,
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
    },
  });
}

export function useActivateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => completeTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useReopenTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reopenTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function usePinTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pinTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useUnpinTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unpinTask(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}

export function useUpdateDescription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      updateTaskDescription(id, description),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: taskQueries.all() });
    },
  });
}
