import { useState } from "react";
import type { Project } from "../../shared/types.ts";
import { deleteProject } from "./api.ts";
import { CreateProject } from "./CreateProject.tsx";

export function ProjectManager({
  projects,
  onChanged,
}: {
  projects: Project[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function handleDelete(id: string) {
    await deleteProject(id);
    onChanged();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        Projects ({projects.length})
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-10 md:hidden" onClick={() => setOpen(false)} />
      <div className="absolute right-0 left-0 top-10 z-10 bg-white border rounded shadow-lg p-4 mx-3 md:left-auto md:right-4 md:mx-0 md:w-80 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold">Projects</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400">
            閉じる
          </button>
        </div>

        {projects.map((p) => (
          <div key={p.id} className="flex items-center justify-between py-2 border-b text-sm">
            <div className="min-w-0 mr-2">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-gray-400 truncate">{p.localPath}</div>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(p.id)}
              className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
            >
              削除
            </button>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="text-sm text-gray-400 py-2">プロジェクトなし</div>
        )}

        <div className="mt-3">
          <CreateProject onCreated={onChanged} />
        </div>
      </div>
    </>
  );
}
