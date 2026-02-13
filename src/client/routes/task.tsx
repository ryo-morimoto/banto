import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rootRoute } from "./root.tsx";
import { TaskInfoPanel } from "../tasks/TaskInfoPanel.tsx";
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

  return (
    <>
      <section className="w-80 flex-shrink-0 border-r bg-white hidden md:block">
        <TaskInfoPanel task={task} />
      </section>
      <main className="flex-1 bg-black min-w-0">
        {task.sessionStatus ? (
          <TerminalView taskId={task.id} sessionStatus={task.sessionStatus} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            セッションなし
          </div>
        )}
      </main>
    </>
  );
}
