import { api, unwrap } from "../api.ts";

export async function listActiveTasks() {
  return unwrap(await api.api.tasks.active.get());
}

export async function listBacklogTasks() {
  return unwrap(await api.api.tasks.backlog.get());
}

export async function listPinnedTasks() {
  return unwrap(await api.api.tasks.pinned.get());
}

export async function getTask(id: string) {
  return unwrap(await api.api.tasks({ id }).get());
}

export async function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
}) {
  return unwrap(await api.api.tasks.post(input));
}

export async function activateTask(id: string) {
  return unwrap(await api.api.tasks({ id }).activate.post());
}

export async function completeTask(id: string) {
  return unwrap(await api.api.tasks({ id }).complete.post());
}

export async function reopenTask(id: string) {
  return unwrap(await api.api.tasks({ id }).reopen.post());
}

export async function pinTask(id: string) {
  return unwrap(await api.api.tasks({ id }).pin.post());
}

export async function unpinTask(id: string) {
  return unwrap(await api.api.tasks({ id }).unpin.post());
}

export async function updateTaskDescription(id: string, description: string) {
  return unwrap(await api.api.tasks({ id }).description.patch({ description }));
}

export async function linkChange(id: string, changeId: string) {
  return unwrap(await api.api.tasks({ id })["link-change"].post({ changeId }));
}

export async function unlinkChange(id: string) {
  return unwrap(await api.api.tasks({ id })["unlink-change"].post());
}

export async function getTaskArtifacts(id: string) {
  return unwrap(await api.api.tasks({ id }).artifacts.get());
}
