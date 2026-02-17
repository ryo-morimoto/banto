import { api, unwrap } from "../api.ts";

export async function startSession(taskId: string) {
  return unwrap(await api.api.tasks({ id: taskId }).session.start.post());
}

export async function retrySession(taskId: string) {
  return unwrap(await api.api.tasks({ id: taskId }).session.retry.post());
}

export async function getSessionLogs(taskId: string) {
  return unwrap(await api.api.tasks({ id: taskId })["session-logs"].get());
}
