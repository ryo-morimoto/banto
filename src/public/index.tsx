import { StrictMode, useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import type { Project, Task } from "@/shared/types.ts";
import { listProjects } from "@/client/projects/api.ts";
import { listActiveTasks, listBacklogTasks, listPinnedTasks, getTask } from "@/client/tasks/api.ts";
import { ProjectManager } from "@/client/projects/ProjectManager.tsx";
import { CreateTask } from "@/client/tasks/CreateTask.tsx";
import { TaskListPanel } from "@/client/tasks/TaskList.tsx";
import { TaskDetail } from "@/client/tasks/TaskDetail.tsx";
import { requestNotificationPermission } from "@/client/notifications.ts";

function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [backlogTasks, setBacklogTasks] = useState<Task[]>([]);
  const [pinnedTasks, setPinnedTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

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
    requestNotificationPermission();
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

  return (
    <div className="h-screen flex flex-col">
      <header className="relative border-b px-4 py-2 flex items-center justify-between bg-white">
        <h1 className="text-sm font-bold">banto</h1>
        <div className="flex gap-3">
          <CreateTask projects={projects} onCreated={refreshTasks} />
          <ProjectManager projects={projects} onChanged={refreshAll} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 border-r bg-white flex-shrink-0">
          <TaskListPanel
            activeTasks={activeTasks}
            backlogTasks={backlogTasks}
            pinnedTasks={pinnedTasks}
            projects={projects}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </aside>

        <main className="flex-1 bg-gray-50">
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
    <App />
  </StrictMode>,
);
