import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createTask } from "./api.ts";
import { requestNotificationPermission } from "../notifications.ts";
import { projectQueries } from "../projects/queries.ts";
import { taskQueries } from "./queries.ts";

export function CreateTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery(projectQueries.list());

  useEffect(() => {
    if (open && projects.length > 0 && !projectId) {
      setProjectId(projects[0]!.id);
    }
  }, [open, projects, projectId]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Focus trap: focus the dialog when it opens
  useEffect(() => {
    if (open) {
      dialogRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    requestNotificationPermission();
    await createTask({
      projectId,
      title,
      description: description || undefined,
    });
    setTitle("");
    setDescription("");
    onClose();
    queryClient.invalidateQueries({ queryKey: taskQueries.lists() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-4"
        tabIndex={-1}
      >
        <h2 className="text-sm font-bold mb-4">タスク追加</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            required
            className="block w-full border px-2 py-1.5 text-sm rounded"
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
            className="block w-full border px-2 py-1.5 text-sm rounded"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="説明（任意）"
            rows={4}
            className="block w-full border px-2 py-1.5 text-sm rounded"
          />
          <div className="flex gap-2 pt-2">
            <button type="submit" className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded">
              作成
            </button>
            <button type="button" onClick={onClose} className="text-sm text-gray-500 px-3 py-1.5">
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
