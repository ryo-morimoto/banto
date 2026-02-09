import { api } from "@/client/api.ts";

export async function listProjects() {
  const { data } = await api.api.projects.get();
  return data!;
}

export async function createProject(input: { name: string; localPath: string; repoUrl?: string }) {
  const { data } = await api.api.projects.post(input);
  return data!;
}

export async function deleteProject(id: string) {
  await api.api.projects({ id }).delete();
}
