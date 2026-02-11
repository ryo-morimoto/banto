import { useState } from "react";
import { useCreateProject } from "./queries.ts";

export function CreateProject() {
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [open, setOpen] = useState(false);
  const createProjectMutation = useCreateProject();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createProjectMutation.mutateAsync({
      name,
      localPath,
      repoUrl: repoUrl || undefined,
    });
    setName("");
    setLocalPath("");
    setRepoUrl("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 hover:underline"
      >
        + プロジェクト追加
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border p-3 rounded">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="プロジェクト名"
        required
        className="block w-full border px-2 py-1 text-sm"
      />
      <input
        value={localPath}
        onChange={(e) => setLocalPath(e.target.value)}
        placeholder="ローカルパス"
        required
        className="block w-full border px-2 py-1 text-sm"
      />
      <input
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        placeholder="リポジトリURL（任意）"
        className="block w-full border px-2 py-1 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={createProjectMutation.isPending}
          className="text-sm bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          作成
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-500">
          キャンセル
        </button>
      </div>
    </form>
  );
}
