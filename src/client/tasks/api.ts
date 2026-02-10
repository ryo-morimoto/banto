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

export async function listAttachments(taskId: string) {
  const res = await fetch(`/api/attachments/task/${taskId}`);
  if (!res.ok) throw new Error(`Failed to list attachments: ${res.status}`);
  return res.json();
}

export async function uploadAttachment(taskId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/attachments/task/${taskId}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Failed to upload attachment: ${res.status}`);
  return res.json();
}

export async function deleteAttachment(id: string) {
  const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete attachment: ${res.status}`);
}
