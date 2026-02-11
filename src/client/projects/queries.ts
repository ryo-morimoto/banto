import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProjects, createProject, deleteProject } from "./api.ts";

export const projectQueries = {
  all: () => ["projects"] as const,
  list: () =>
    queryOptions({
      queryKey: [...projectQueries.all(), "list"] as const,
      queryFn: listProjects,
      staleTime: 5 * 60 * 1000,
    }),
};

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: projectQueries.all() });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSettled: () => {
      return queryClient.invalidateQueries({ queryKey: projectQueries.all() });
    },
  });
}
