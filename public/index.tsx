import "./global.css";
import { StrictMode, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "../src/shared/types.ts";
import { listSessionsByTask } from "../src/client/sessions/api.ts";
import { ProjectManager } from "../src/client/projects/ProjectManager.tsx";
import { CreateTaskModal } from "../src/client/tasks/CreateTaskModal.tsx";
import { TaskListPanel } from "../src/client/tasks/TaskList.tsx";
import { TaskInfoPanel } from "../src/client/tasks/TaskInfoPanel.tsx";
import { SessionChatPanel } from "../src/client/sessions/SessionChatPanel.tsx";
import { queryClient } from "../src/client/queryClient.ts";
import { projectQueries } from "../src/client/projects/queries.ts";
import { taskQueries } from "../src/client/tasks/queries.ts";

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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);

  const queryClientRef = useQueryClient();
  const { data: projects = [] } = useQuery(projectQueries.list());
  const { data: activeTasks = [] } = useQuery(taskQueries.active());
  const { data: backlogTasks = [] } = useQuery(taskQueries.backlog());
  const { data: pinnedTasks = [] } = useQuery(taskQueries.pinned());
  const { data: selectedTask = null } = useQuery({
    ...taskQueries.detail(selectedTaskId!),
    enabled: !!selectedTaskId,
  });

  // Session state (temporary — will move to child components in Phase 1-2)
  const [latestSession, setLatestSession] = useState<Session | null>(null);

  const refreshSession = useCallback(async () => {
    if (!selectedTaskId) return;
    const sessions = await listSessionsByTask(selectedTaskId);
    setLatestSession(sessions[0] ?? null);
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) {
      setLatestSession(null);
      return;
    }
    refreshSession();
  }, [selectedTaskId, refreshSession]);

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

  function handleTaskUpdated() {
    queryClientRef.invalidateQueries({ queryKey: taskQueries.all() });
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
          <ProjectManager />
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

      <CreateTaskModal open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} />
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
