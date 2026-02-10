import { api, unwrap } from "../api.ts";

export async function listAttachments(taskId: string) {
  return unwrap(await api.api.attachments.task({ taskId }).get());
}

export async function uploadAttachment(taskId: string, file: File) {
  return unwrap(await api.api.attachments.task({ taskId }).post({ file }));
}

export async function deleteAttachment(id: string) {
  return unwrap(await api.api.attachments({ id }).delete());
}
