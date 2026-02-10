import { useState, useEffect } from "react";
import { createRootRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { ProjectManager } from "../projects/ProjectManager.tsx";
import { CreateTaskModal } from "../tasks/CreateTaskModal.tsx";
import { TaskListPanel } from "../tasks/TaskList.tsx";

export const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <div className="p-4">404 - ページが見つかりません</div>,
});

function RootLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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
          <Link to="/" className="text-sm font-bold">
            banto
          </Link>
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
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 md:flex-shrink-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full pt-11 md:pt-0">
            <TaskListPanel />
          </div>
        </aside>

        <Outlet />
      </div>

      <CreateTaskModal open={createTaskOpen} onClose={() => setCreateTaskOpen(false)} />
    </div>
  );
}
