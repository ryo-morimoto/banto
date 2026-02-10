import { api, unwrap } from "../api.ts";

export async function listProjects() {
  return unwrap(await api.api.projects.get());
}

export async function createProject(input: { name: string; localPath: string; repoUrl?: string }) {
  return unwrap(await api.api.projects.post(input));
}

export async function deleteProject(id: string) {
  await api.api.projects({ id }).delete();
}
