import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root.tsx";

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IndexPage,
});

function IndexPage() {
  return (
    <>
      <section className="w-80 flex-shrink-0 border-r bg-white hidden md:flex items-center justify-center">
        <div className="text-gray-400 text-sm">タスクを選択してください</div>
      </section>
      <main className="flex-1 bg-gray-50 min-w-0 flex items-center justify-center">
        <div className="text-gray-400 text-sm">セッション</div>
      </main>
    </>
  );
}
