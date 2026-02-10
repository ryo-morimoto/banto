import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Task } from "../../shared/types.ts";
import {
  activateTask,
  completeTask,
  reopenTask,
  pinTask,
  unpinTask,
  updateTaskDescription,
} from "./api.ts";
import { startSession } from "../sessions/api.ts";
import { uploadAttachment, deleteAttachment } from "../attachments/api.ts";
import { taskQueries } from "./queries.ts";
import { sessionQueries } from "../sessions/queries.ts";
import { attachmentQueries } from "../attachments/queries.ts";
import { sendNotification } from "../notifications.ts";

function isActiveSession(status: string) {
  return status === "pending" || status === "provisioning" || status === "running";
}

function DescriptionEditor({
  taskId,
  initial,
  onSaved,
}: {
  taskId: string;
  initial: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");

  useEffect(() => {
    setValue(initial ?? "");
  }, [initial]);

  async function handleSave() {
    await updateTaskDescription(taskId, value);
    setEditing(false);
    onSaved();
  }

  if (!editing) {
    return (
      <div className="mb-4">
        {initial ? (
          <div
            className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded cursor-pointer hover:bg-gray-100"
            onClick={() => setEditing(true)}
          >
            {initial}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            + 説明を追加
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={4}
        className="block w-full border px-2 py-1 text-sm rounded"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="text-xs bg-blue-600 text-white px-3 py-1 rounded"
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(initial ?? "");
            setEditing(false);
          }}
          className="text-xs text-gray-500"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

export function TaskInfoPanel({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { data: attachments = [] } = useQuery(attachmentQueries.byTask(task.id));
  const sessionsQuery = useQuery(sessionQueries.byTask(task.id));
  const latestSession = sessionsQuery.data?.[0] ?? null;

  // Notification status tracking
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!sessionsQuery.data) return;
    for (const session of sessionsQuery.data) {
      const prev = prevStatusRef.current.get(session.id);
      if (prev && prev !== session.status) {
        if (session.status === "done" || session.status === "failed") {
          sendNotification(
            "banto",
            `セッション${session.status === "done" ? "完了" : "失敗"}: ${task.title}`,
          );
        }
      }
      prevStatusRef.current.set(session.id, session.status);
    }
  }, [sessionsQuery.data, task.title]);

  // Paste to upload attachment
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            uploadAttachment(task.id, file).then(() =>
              queryClient.invalidateQueries({
                queryKey: attachmentQueries.byTask(task.id).queryKey,
              }),
            );
          }
          return;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [task.id, queryClient]);

  function handleTaskUpdated() {
    queryClient.invalidateQueries({ queryKey: taskQueries.all() });
  }

  async function handleAction(action: () => Promise<unknown>) {
    await action();
    handleTaskUpdated();
  }

  async function handleStartSession() {
    await startSession(task.id);
    queryClient.invalidateQueries({ queryKey: sessionQueries.byTask(task.id).queryKey });
  }

  async function handleDeleteAttachment(id: string) {
    await deleteAttachment(id);
    queryClient.invalidateQueries({ queryKey: attachmentQueries.byTask(task.id).queryKey });
  }

  const hasActiveSession = latestSession ? isActiveSession(latestSession.status) : false;

  return (
    <div className="p-3 md:p-4 h-full overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-base font-bold break-words">{task.title}</h2>
        <div className="text-xs text-gray-400 mt-1">
          <span className="font-mono">{task.status}</span>
          {task.pinned && <span className="ml-2 text-yellow-500">pinned</span>}
        </div>
      </div>

      <DescriptionEditor taskId={task.id} initial={task.description} onSaved={handleTaskUpdated} />

      {attachments.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-bold mb-2 text-gray-500">
            Attachments ({attachments.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="relative group">
                <img
                  src={`/api/attachments/${a.id}/file`}
                  alt={a.originalName}
                  className="w-20 h-20 object-cover rounded border"
                />
                <button
                  type="button"
                  onClick={() => handleDeleteAttachment(a.id)}
                  className="absolute -top-1 -right-1 hidden group-hover:block bg-red-500 text-white rounded-full w-4 h-4 text-xs leading-4 text-center"
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-400 mt-1">画像をクリップボードから貼り付けできます</div>
        </div>
      )}

      {attachments.length === 0 && (
        <div className="mb-4 text-xs text-gray-400">画像をクリップボードから貼り付けできます</div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {task.status === "backlog" && (
          <button
            type="button"
            onClick={() => handleAction(() => activateTask(task.id))}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded"
          >
            Activate
          </button>
        )}
        {task.status === "active" && (
          <>
            <button
              type="button"
              onClick={() => handleAction(() => completeTask(task.id))}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded"
            >
              Complete
            </button>
            {!hasActiveSession && (
              <button
                type="button"
                onClick={handleStartSession}
                className="text-xs bg-purple-600 text-white px-3 py-1 rounded"
              >
                Start Session
              </button>
            )}
          </>
        )}
        {task.status === "done" && (
          <button
            type="button"
            onClick={() => handleAction(() => reopenTask(task.id))}
            className="text-xs bg-orange-600 text-white px-3 py-1 rounded"
          >
            Reopen
          </button>
        )}
        {task.pinned ? (
          <button
            type="button"
            onClick={() => handleAction(() => unpinTask(task.id))}
            className="text-xs border px-3 py-1 rounded"
          >
            Unpin
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleAction(() => pinTask(task.id))}
            className="text-xs border px-3 py-1 rounded"
          >
            Pin
          </button>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold mb-2 text-gray-500">Agent Todo</h3>
        <div className="text-xs text-gray-400">データなし</div>
      </div>
    </div>
  );
}
