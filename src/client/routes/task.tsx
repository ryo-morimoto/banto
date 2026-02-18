import { useState } from "react";
import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rootRoute } from "./root.tsx";
import { TaskInfoPanel } from "../tasks/TaskInfoPanel.tsx";
import { ArtifactPanel } from "../tasks/ArtifactPanel.tsx";
import { TerminalView } from "../sessions/TerminalView.tsx";
import { taskQueries } from "../tasks/queries.ts";

export const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/$taskId",
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = taskRoute.useParams();
  const {
    data: task,
    isLoading,
    error,
  } = useQuery({
    ...taskQueries.detail(taskId),
    refetchInterval: (query) => {
      const t = query.state.data;
      if (!t) return false;
      // Poll while session is active
      const active =
        t.sessionStatus === "pending" ||
        t.sessionStatus === "provisioning" ||
        t.sessionStatus === "running" ||
        t.sessionStatus === "waiting_for_input";
      return active ? 2000 : false;
    },
  });

  if (isLoading) {
    return (
      <>
        <section className="w-80 flex-shrink-0 border-r bg-white hidden md:flex items-center justify-center">
          <div className="text-gray-400 text-sm">読み込み中...</div>
        </section>
        <main className="flex-1 bg-gray-50 min-w-0" />
      </>
    );
  }

  if (error || !task) {
    return (
      <>
        <section className="w-80 flex-shrink-0 border-r bg-white hidden md:flex items-center justify-center">
          <div className="text-red-400 text-sm">タスクが見つかりません</div>
        </section>
        <main className="flex-1 bg-gray-50 min-w-0" />
      </>
    );
  }

  const hasChange = !!task.changeId;
  const hasSession = !!task.sessionStatus;
  const [mainView, setMainView] = useState<"terminal" | "artifacts">(
    hasChange && !hasSession ? "artifacts" : "terminal",
  );

  return (
    <>
      <section className="w-80 flex-shrink-0 border-r bg-white hidden md:block">
        <TaskInfoPanel task={task} />
      </section>
      <main className="flex-1 min-w-0 flex flex-col">
        {(hasChange || hasSession) && (
          <div className="flex border-b bg-gray-50 shrink-0">
            {hasSession && (
              <button
                type="button"
                onClick={() => setMainView("terminal")}
                className={`px-4 py-2 text-xs font-medium border-b-2 ${
                  mainView === "terminal"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Terminal
              </button>
            )}
            {hasChange && (
              <button
                type="button"
                onClick={() => setMainView("artifacts")}
                className={`px-4 py-2 text-xs font-medium border-b-2 ${
                  mainView === "artifacts"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Artifacts
              </button>
            )}
          </div>
        )}
        <div className={`flex-1 min-h-0 ${mainView === "terminal" ? "bg-black" : "bg-white"}`}>
          {mainView === "terminal" && hasSession ? (
            <TerminalView taskId={task.id} sessionStatus={task.sessionStatus!} />
          ) : mainView === "artifacts" && hasChange ? (
            <ArtifactPanel taskId={task.id} />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              セッションなし
            </div>
          )}
        </div>
      </main>
    </>
  );
}
