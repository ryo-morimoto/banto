import { createRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { rootRoute } from "./root.tsx";
import { TaskInfoPanel } from "../tasks/TaskInfoPanel.tsx";
import { SessionChatPanel } from "../sessions/SessionChatPanel.tsx";
import { taskQueries } from "../tasks/queries.ts";

export const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/$taskId",
  component: TaskDetailPage,
});

function TaskDetailPage() {
  const { taskId } = taskRoute.useParams();
  const { data: task, isLoading, error } = useQuery(taskQueries.detail(taskId));

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
      <main className="flex-1 bg-gray-50 min-w-0">
        <SessionChatPanel task={task} />
      </main>
    </>
  );
}
