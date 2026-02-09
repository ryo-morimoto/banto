import { api } from "@/client/api.ts";

export async function listActiveTasks() {
  const { data } = await api.api.tasks.active.get();
  return data!;
}

export async function listBacklogTasks() {
  const { data } = await api.api.tasks.backlog.get();
  return data!;
}

export async function listPinnedTasks() {
  const { data } = await api.api.tasks.pinned.get();
  return data!;
}

export async function getTask(id: string) {
  const { data } = await api.api.tasks({ id }).get();
  return data!;
}

export async function createTask(input: {
  projectId: string;
  title: string;
  description?: string;
}) {
  const { data } = await api.api.tasks.post(input);
  return data!;
}

export async function activateTask(id: string) {
  const { data } = await api.api.tasks({ id }).activate.post();
  return data!;
}

export async function completeTask(id: string) {
  const { data } = await api.api.tasks({ id }).complete.post();
  return data!;
}

export async function reopenTask(id: string) {
  const { data } = await api.api.tasks({ id }).reopen.post();
  return data!;
}

export async function pinTask(id: string) {
  const { data } = await api.api.tasks({ id }).pin.post();
  return data!;
}

export async function unpinTask(id: string) {
  const { data } = await api.api.tasks({ id }).unpin.post();
  return data!;
}

export async function updateTaskDescription(id: string, description: string) {
  const { data } = await api.api.tasks({ id }).description.patch({ description });
  return data!;
}
