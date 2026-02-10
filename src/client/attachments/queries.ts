import { queryOptions } from "@tanstack/react-query";
import { listAttachments } from "./api.ts";

export const attachmentQueries = {
  all: () => ["attachments"] as const,
  byTask: (taskId: string) =>
    queryOptions({
      queryKey: [...attachmentQueries.all(), "byTask", taskId] as const,
      queryFn: () => listAttachments(taskId),
    }),
};
