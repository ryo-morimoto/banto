import type { Task, Project } from "@/shared/types.ts";

function TaskItem({
  task,
  selected,
  onSelect,
}: {
  task: Task;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(task.id)}
      className={`block w-full text-left px-3 py-2 text-sm border-b hover:bg-gray-50 ${
        selected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {task.pinned && <span className="text-yellow-500 text-xs">pin</span>}
        <span className="truncate">{task.title}</span>
        <span className="ml-auto text-xs text-gray-400">{task.status}</span>
      </div>
    </button>
  );
}

function groupByProject(tasks: Task[]) {
  const grouped = new Map<string, Task[]>();
  for (const task of tasks) {
    const list = grouped.get(task.projectId) ?? [];
    list.push(task);
    grouped.set(task.projectId, list);
  }
  return grouped;
}

export function TaskListPanel({
  activeTasks,
  backlogTasks,
  pinnedTasks,
  projects,
  selectedTaskId,
  onSelectTask,
}: {
  activeTasks: Task[];
  backlogTasks: Task[];
  pinnedTasks: Task[];
  projects: Project[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const activeGrouped = groupByProject(activeTasks);

  // Pinned tasks not already shown in active
  const activeIds = new Set(activeTasks.map((t) => t.id));
  const pinnedOnly = pinnedTasks.filter((t) => !activeIds.has(t.id));

  const backlogGrouped = groupByProject(
    backlogTasks.filter((t) => !t.pinned || !pinnedOnly.some((p) => p.id === t.id)),
  );

  function renderSection(label: string, grouped: Map<string, Task[]>) {
    if (grouped.size === 0) return null;
    return [...grouped.entries()].map(([projectId, tasks]) => (
      <div key={`${label}-${projectId}`}>
        <div className="px-3 py-1 text-xs font-bold text-gray-500 bg-gray-100">
          {projectMap.get(projectId)?.name ?? projectId}
        </div>
        {tasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            selected={task.id === selectedTaskId}
            onSelect={onSelectTask}
          />
        ))}
      </div>
    ));
  }

  return (
    <div className="h-full overflow-y-auto">
      {pinnedOnly.length > 0 && (
        <div>
          <div className="px-3 py-1 text-xs font-bold text-gray-500 bg-yellow-50 uppercase">
            Pinned
          </div>
          {pinnedOnly.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              onSelect={onSelectTask}
            />
          ))}
        </div>
      )}

      {activeGrouped.size > 0 && (
        <div>
          <div className="px-3 py-1 text-xs font-bold text-blue-600 bg-blue-50 uppercase">
            Active
          </div>
          {renderSection("active", activeGrouped)}
        </div>
      )}

      {backlogGrouped.size > 0 && (
        <div>
          <div className="px-3 py-1 text-xs font-bold text-gray-500 bg-gray-50 uppercase">
            Backlog
          </div>
          {renderSection("backlog", backlogGrouped)}
        </div>
      )}

      {activeTasks.length === 0 && backlogTasks.length === 0 && pinnedOnly.length === 0 && (
        <div className="p-4 text-sm text-gray-400">タスクがありません</div>
      )}
    </div>
  );
}
