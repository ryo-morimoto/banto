import { useState } from "react";
import type { Project } from "../../shared/types.ts";
import { createTask } from "./api.ts";
import { requestNotificationPermission } from "../notifications.ts";

export function CreateTask({
  projects,
  onCreated,
}: {
  projects: Project[];
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requestNotificationPermission();
    await createTask({
      projectId,
      title,
      description: description || undefined,
    });
    setTitle("");
    setDescription("");
    setOpen(false);
    onCreated();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (projects.length > 0 && !projectId) setProjectId(projects[0]!.id);
          setOpen(true);
        }}
        className="text-xs text-blue-600 hover:underline"
      >
        + タスク追加
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-10 md:hidden" onClick={() => setOpen(false)} />
      <form
        onSubmit={handleSubmit}
        className="absolute right-0 left-0 top-10 z-10 border p-3 rounded shadow-lg space-y-2 bg-white mx-3 md:left-auto md:right-4 md:mx-0 md:w-80"
      >
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          required
          className="block w-full border px-2 py-1.5 md:py-1 text-sm rounded"
        >
          <option value="">プロジェクト選択</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タスクタイトル"
          required
          className="block w-full border px-2 py-1.5 md:py-1 text-sm rounded"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="説明（任意）"
          rows={3}
          className="block w-full border px-2 py-1.5 md:py-1 text-sm rounded"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="text-sm bg-blue-600 text-white px-3 py-1.5 md:py-1 rounded"
          >
            作成
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-gray-500 px-2 py-1.5 md:py-1"
          >
            キャンセル
          </button>
        </div>
      </form>
    </>
  );
}
