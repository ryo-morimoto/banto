import { api, unwrap } from "../api.ts";

export async function listSessionsByTask(taskId: string) {
  return unwrap(await api.api.sessions.task({ taskId }).get());
}

export async function getSession(id: string) {
  return unwrap(await api.api.sessions({ id }).get());
}

export async function startSession(taskId: string) {
  return unwrap(await api.api.sessions.post({ taskId }));
}
