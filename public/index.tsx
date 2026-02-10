import "./global.css";
import { StrictMode, useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import type { Project, Task, Session } from "../src/shared/types.ts";
import { listProjects } from "../src/client/projects/api.ts";
import {
  listActiveTasks,
  listBacklogTasks,
  listPinnedTasks,
  getTask,
} from "../src/client/tasks/api.ts";
import { listSessionsByTask } from "../src/client/sessions/api.ts";
import { ProjectManager } from "../src/client/projects/ProjectManager.tsx";
import { CreateTaskModal } from "../src/client/tasks/CreateTaskModal.tsx";
import { TaskListPanel } from "../src/client/tasks/TaskList.tsx";
import { TaskInfoPanel } from "../src/client/tasks/TaskInfoPanel.tsx";
import { SessionChatPanel } from "../src/client/sessions/SessionChatPanel.tsx";
import { sendNotification } from "../src/client/notifications.ts";
import { queryClient } from "../src/client/queryClient.ts";

import { ErrorBoundary, reportErrorToServer } from "../src/client/ErrorBoundary.tsx";
import { ApiError } from "../src/client/api.ts";

window.addEventListener("unhandledrejection", (event) => {
  const err = event.reason;
  reportErrorToServer(
    err?.message ?? String(err),
    err?.stack,
    err instanceof ApiError ? (err.requestId ?? undefined) : undefined,
  );
});

window.addEventListener("error", (event) => {
  reportErrorToServer(event.message, event.error?.stack);
});

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [pinnedTasks, setPinnedTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [latestSession, setLatestSession] = useState<Session | null>(null);
  const [runningTaskIds, setRunningTaskIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const refreshProjects = useCallback(async () => {
    setProjects(await listProjects());
  }, []);

  const refreshTasks = useCallback(async () => {
    const [active, backlog, pinned] = await Promise.all([
      listActiveTasks(),
      listBacklogTasks(),
      listPinnedTasks(),
    ]);
    setActiveTasks(active);
    setBacklogTasks(backlog);
    setPinnedTasks(pinned);

    // Check which active tasks have running sessions
    const sessionChecks = await Promise.all(
      active.map(async (t) => {
        const sessions = await listSessionsByTask(t.id);
        const latest = sessions[0];
        if (
          latest &&
          (latest.status === "pending" ||
            latest.status === "provisioning" ||
            latest.status === "running")
        ) {
          return t.id;
        }
        return null;
      }),
    );
    setRunningTaskIds(new Set(sessionChecks.filter((id): id is string => id !== null)));
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProjects(), refreshTasks()]);
  }, [refreshProjects, refreshTasks]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshTasks, 5000);
    return () => clearInterval(interval);
  }, [refreshAll, refreshTasks]);

  useEffect(() => {
    if (!selectedTaskId) {
      setSelectedTask(null);
      setLatestSession(null);
      return;
    }
    getTask(selectedTaskId).then(setSelectedTask);
  }, [selectedTaskId]);

  const refreshSession = useCallback(async () => {
    if (!selectedTaskId) return;
    const sessions = await listSessionsByTask(selectedTaskId);
    setLatestSession(sessions[0] ?? null);
  }, [selectedTaskId]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Track previous session status for notifications
  const prevSessionStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latestSession || !selectedTask) return;
    const prev = prevSessionStatusRef.current;
    if (prev && prev !== latestSession.status) {
      if (latestSession.status === "done") {
        sendNotification("banto", `セッション完了: ${selectedTask.title}`);
      } else if (latestSession.status === "failed") {
        sendNotification("banto", `セッション失敗: ${selectedTask.title}`);
      }
    }
    prevSessionStatusRef.current = latestSession.status;
  }, [latestSession, selectedTask]);

  // Poll session every 2s when there's an active session
  useEffect(() => {
    if (
      !latestSession ||
      (latestSession.status !== "pending" &&
        latestSession.status !== "provisioning" &&
        latestSession.status !== "running")
    ) {
      return;
    }
    const interval = setInterval(refreshSession, 2000);
    return () => clearInterval(interval);
  }, [latestSession, refreshSession]);

  async function handleTaskUpdated() {
    await refreshTasks();
    if (selectedTaskId) {
      setSelectedTask(await getTask(selectedTaskId));
    }
  }

  function handleSelectTask(id: string) {
    setSelectedTaskId(id);
    setSidebarOpen(false);
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="relative border-b px-3 py-2 flex items-center justify-between bg-white md:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden text-gray-600 p-1"
            aria-label="メニュー"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-sm font-bold">banto</h1>
        </div>
        <div className="flex gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => setCreateTaskOpen(true)}
            className="text-xs text-blue-600 hover:underline"
          >
            + タスク追加
          </button>
          <ProjectManager projects={projects} onChanged={refreshAll} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left: Task list sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:flex-shrink-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full pt-11 md:pt-0">
            <TaskListPanel
              activeTasks={activeTasks}
              backlogTasks={backlogTasks}
              pinnedTasks={pinnedTasks}
              projects={projects}
              selectedTaskId={selectedTaskId}
              runningTaskIds={runningTaskIds}
              onSelectTask={handleSelectTask}
            />
          </div>
        </aside>

        {/* Middle: Task info panel */}
        <section className="w-80 flex-shrink-0 border-r bg-white hidden md:block">
          {selectedTask ? (
            <TaskInfoPanel
              task={selectedTask}
              latestSession={latestSession}
              onUpdated={handleTaskUpdated}
              onSessionStarted={refreshSession}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              タスクを選択してください
            </div>
          )}
        </section>

        {/* Right: Session chat panel */}
        <main className="flex-1 bg-gray-50 min-w-0">
          {selectedTask ? (
            <SessionChatPanel
              session={latestSession}
              taskId={selectedTask.id}
              taskStatus={selectedTask.status}
              onSessionStarted={refreshSession}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              セッション
            </div>
          )}
        </main>
      </div>

      <CreateTaskModal
        projects={projects}
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        onCreated={refreshTasks}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
