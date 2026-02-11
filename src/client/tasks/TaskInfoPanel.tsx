import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "../../shared/types.ts";
import {
  useActivateTask,
  useCompleteTask,
  useReopenTask,
  usePinTask,
  useUnpinTask,
  useUpdateDescription,
} from "./queries.ts";
import { useStartSession } from "../sessions/queries.ts";
import { sessionQueries } from "../sessions/queries.ts";
import {
  attachmentQueries,
  useUploadAttachment,
  useDeleteAttachment,
} from "../attachments/queries.ts";
import { sendNotification } from "../notifications.ts";

function isActiveSession(status: string) {
  return (
    status === "pending" ||
    status === "provisioning" ||
    status === "running" ||
    status === "waiting_for_input"
  );
}

function DescriptionEditor({ taskId, initial }: { taskId: string; initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const updateDescription = useUpdateDescription();

  useEffect(() => {
    setValue(initial ?? "");
  }, [initial]);

  function handleSave() {
    updateDescription.mutate(
      { id: taskId, description: value },
      { onSuccess: () => setEditing(false) },
    );
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
          disabled={updateDescription.isPending}
          className="text-xs bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
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
  const { data: attachments = [] } = useQuery(attachmentQueries.byTask(task.id));
  const sessionsQuery = useQuery(sessionQueries.byTask(task.id));
  const latestSession = sessionsQuery.data?.[0] ?? null;

  const activateMutation = useActivateTask();
  const completeMutation = useCompleteTask();
  const reopenMutation = useReopenTask();
  const pinMutation = usePinTask();
  const unpinMutation = useUnpinTask();
  const startSessionMutation = useStartSession();
  const uploadMutation = useUploadAttachment();
  const deleteMutation = useDeleteAttachment(task.id);

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
            uploadMutation.mutate({ taskId: task.id, file });
          }
          return;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [task.id, uploadMutation.mutate]);

  const hasActiveSession = latestSession ? isActiveSession(latestSession.status) : false;
  const anyPending =
    activateMutation.isPending ||
    completeMutation.isPending ||
    reopenMutation.isPending ||
    pinMutation.isPending ||
    unpinMutation.isPending;

  return (
    <div className="p-3 md:p-4 h-full overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-base font-bold break-words">{task.title}</h2>
        <div className="text-xs text-gray-400 mt-1">
          <span className="font-mono">{task.status}</span>
          {task.pinned && <span className="ml-2 text-yellow-500">pinned</span>}
        </div>
      </div>

      <DescriptionEditor taskId={task.id} initial={task.description} />

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
                  onClick={() => deleteMutation.mutate(a.id)}
                  disabled={deleteMutation.isPending}
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
            onClick={() => activateMutation.mutate(task.id)}
            disabled={anyPending}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
          >
            Activate
          </button>
        )}
        {task.status === "active" && (
          <>
            <button
              type="button"
              onClick={() => completeMutation.mutate(task.id)}
              disabled={anyPending}
              className="text-xs bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50"
            >
              Complete
            </button>
            {!hasActiveSession && (
              <button
                type="button"
                onClick={() => startSessionMutation.mutate(task.id)}
                disabled={startSessionMutation.isPending}
                className="text-xs bg-purple-600 text-white px-3 py-1 rounded disabled:opacity-50"
              >
                Start Session
              </button>
            )}
          </>
        )}
        {task.status === "done" && (
          <button
            type="button"
            onClick={() => reopenMutation.mutate(task.id)}
            disabled={anyPending}
            className="text-xs bg-orange-600 text-white px-3 py-1 rounded disabled:opacity-50"
          >
            Reopen
          </button>
        )}
        {task.pinned ? (
          <button
            type="button"
            onClick={() => unpinMutation.mutate(task.id)}
            disabled={anyPending}
            className="text-xs border px-3 py-1 rounded disabled:opacity-50"
          >
            Unpin
          </button>
        ) : (
          <button
            type="button"
            onClick={() => pinMutation.mutate(task.id)}
            disabled={anyPending}
            className="text-xs border px-3 py-1 rounded disabled:opacity-50"
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
