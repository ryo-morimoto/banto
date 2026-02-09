import { useState, useEffect, useCallback, useRef } from "react";
import type { Task, Session, Attachment } from "@/shared/types.ts";
import { sendNotification } from "@/client/notifications.ts";
import {
  activateTask,
  completeTask,
  reopenTask,
  pinTask,
  unpinTask,
  updateTaskDescription,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
} from "./api.ts";
import { listSessionsByTask, startSession } from "@/client/sessions/api.ts";
import { SessionLog } from "@/client/sessions/SessionLog.tsx";

function isActiveSession(status: string) {
  return status === "pending" || status === "provisioning" || status === "running";
}

function SessionRow({ session }: { session: Session }) {
  const statusColor: Record<string, string> = {
    pending: "text-gray-500",
    provisioning: "text-yellow-600",
    running: "text-blue-600",
    done: "text-green-600",
    failed: "text-red-600",
  };

  return (
    <div className="py-2 border-b">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-xs ${statusColor[session.status]}`}>
            {session.status}
          </span>
          {"branch" in session && session.branch && (
            <span className="text-xs text-gray-400">{session.branch}</span>
          )}
          {"error" in session && session.error && (
            <span className="text-xs text-red-500">{session.error}</span>
          )}
        </div>
        <div className="text-xs text-gray-400">{session.createdAt}</div>
      </div>
      {isActiveSession(session.status) && (
        <div className="mt-2">
          <SessionLog sessionId={session.id} />
        </div>
      )}
    </div>
  );
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

export function TaskDetail({ task, onUpdated }: { task: Task; onUpdated: () => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const refreshSessions = useCallback(async () => {
    setSessions(await listSessionsByTask(task.id));
  }, [task.id]);

  const refreshAttachments = useCallback(async () => {
    setAttachments(await listAttachments(task.id));
  }, [task.id]);

  useEffect(() => {
    refreshSessions();
    refreshAttachments();
  }, [refreshSessions, refreshAttachments]);

  // Paste event listener for image uploads
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            uploadAttachment(task.id, file).then(() => refreshAttachments());
          }
          return;
        }
      }
    }
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [task.id, refreshAttachments]);

  // Track previous session statuses for notification detection
  const prevStatusesRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const prev = prevStatusesRef.current;
    for (const session of sessions) {
      const prevStatus = prev.get(session.id);
      if (prevStatus && prevStatus !== session.status) {
        if (session.status === "done") {
          sendNotification("banto", `セッション完了: ${task.title}`);
        } else if (session.status === "failed") {
          sendNotification("banto", `セッション失敗: ${task.title}`);
        }
      }
    }
    prevStatusesRef.current = new Map(sessions.map((s) => [s.id, s.status]));
  }, [sessions, task.title]);

  // Poll sessions every 2s when there's an active session
  useEffect(() => {
    const hasActive = sessions.some(
      (s) => s.status === "pending" || s.status === "provisioning" || s.status === "running",
    );
    if (!hasActive) return;
    const interval = setInterval(refreshSessions, 2000);
    return () => clearInterval(interval);
  }, [sessions, refreshSessions]);

  async function handleAction(action: () => Promise<unknown>) {
    await action();
    onUpdated();
  }

  async function handleStartSession() {
    await startSession(task.id);
    await refreshSessions();
  }

  const hasActiveSession = sessions.some(
    (s) => s.status === "pending" || s.status === "provisioning" || s.status === "running",
  );

  return (
    <div className="p-4 h-full overflow-y-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">{task.title}</h2>
          <div className="text-xs text-gray-400 mt-1">
            <span className="font-mono">{task.status}</span>
            {task.pinned && <span className="ml-2 text-yellow-500">pinned</span>}
          </div>
        </div>
      </div>

      <DescriptionEditor taskId={task.id} initial={task.description} onSaved={onUpdated} />

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
                  onClick={async () => {
                    await deleteAttachment(a.id);
                    refreshAttachments();
                  }}
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
        <h3 className="text-sm font-bold mb-2">Sessions ({sessions.length})</h3>
        {sessions.length === 0 && <div className="text-sm text-gray-400">セッションなし</div>}
        {sessions.map((s) => (
          <SessionRow key={s.id} session={s} />
        ))}
      </div>
    </div>
  );
}
