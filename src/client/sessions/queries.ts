import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startSession, retrySession } from "./api.ts";
import { taskQueries } from "../tasks/queries.ts";

export function useStartSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => startSession(taskId),
    onSettled: (_data, _error, taskId) => {
      return queryClient.invalidateQueries({
        queryKey: taskQueries.detail(taskId).queryKey,
      });
    },
  });
}

export function useRetrySession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => retrySession(taskId),
    onSettled: (_data, _error, taskId) => {
      return queryClient.invalidateQueries({
        queryKey: taskQueries.detail(taskId).queryKey,
      });
    },
  });
}
