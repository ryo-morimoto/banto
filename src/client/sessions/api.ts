import { api } from "@/client/api.ts";

export async function listSessionsByTask(taskId: string) {
  const { data } = await api.api.sessions.task({ taskId }).get();
  return data!;
}

export async function getSession(id: string) {
  const { data } = await api.api.sessions({ id }).get();
  return data!;
}

export async function startSession(taskId: string) {
  const { data } = await api.api.sessions.post({ taskId });
  return data!;
}
