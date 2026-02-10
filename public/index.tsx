import "./global.css";
import { StrictMode, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { Project, Task } from "../src/shared/types.ts";
import { listProjects } from "../src/client/projects/api.ts";
import { listActiveTasks, listBacklogTasks, listPinnedTasks, getTask } from "../src/client/tasks/api.ts";
import { ProjectManager } from "../src/client/projects/ProjectManager.tsx";
import { CreateTask } from "../src/client/tasks/CreateTask.tsx";
import { TaskListPanel } from "../src/client/tasks/TaskList.tsx";
import { TaskDetail } from "../src/client/tasks/TaskDetail.tsx";

import { ErrorBoundary, reportErrorToServer } from "../src/client/ErrorBoundary.tsx";
import { ApiError } from "../src/client/api.ts";

window.addEventListener("unhandledrejection", (event) => {
  const err = event.reason;
  reportErrorToServer(
    err?.message ?? String(err),
    err?.stack,
    err instanceof ApiError ? err.requestId ?? undefined : undefined,
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      return;
    }
    getTask(selectedTaskId).then(setSelectedTask);
  }, [selectedTaskId]);

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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-sm font-bold">banto</h1>
        </div>
        <div className="flex gap-2 md:gap-3">
          <CreateTask projects={projects} onCreated={refreshTasks} />
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

        {/* Sidebar: overlay on mobile, static on desktop */}
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:flex-shrink-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Offset for header height on mobile */}
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

        <main className="flex-1 bg-gray-50 min-w-0">
          {selectedTask ? (
            <TaskDetail task={selectedTask} onUpdated={handleTaskUpdated} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              タスクを選択してください
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
