import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { listAttachments, uploadAttachment, deleteAttachment } from "./api.ts";

export const attachmentQueries = {
  all: () => ["attachments"] as const,
  byTask: (taskId: string) =>
    queryOptions({
      queryKey: [...attachmentQueries.all(), "byTask", taskId] as const,
      queryFn: () => listAttachments(taskId),
    }),
};

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      uploadAttachment(taskId, file),
    onSettled: (_data, _error, variables) => {
      return queryClient.invalidateQueries({
        queryKey: attachmentQueries.byTask(variables.taskId).queryKey,
      });
    },
  });
}

export function useDeleteAttachment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSettled: () => {
      return queryClient.invalidateQueries({
        queryKey: attachmentQueries.byTask(taskId).queryKey,
      });
    },
  });
}
