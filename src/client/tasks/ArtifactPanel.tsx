import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { taskQueries } from "./queries.ts";

type TabId = "proposal" | "design" | "tasks";

const TABS: { id: TabId; label: string }[] = [
  { id: "proposal", label: "Proposal" },
  { id: "design", label: "Design" },
  { id: "tasks", label: "Tasks" },
];

export function ArtifactPanel({ taskId }: { taskId: string }) {
  const { data: artifacts, isLoading } = useQuery({
    ...taskQueries.artifacts(taskId),
    refetchInterval: 10000,
  });
  const [activeTab, setActiveTab] = useState<TabId>("proposal");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        読み込み中...
      </div>
    );
  }

  if (!artifacts) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        アーティファクトなし
      </div>
    );
  }

  const hasAny = artifacts.proposal || artifacts.design || artifacts.tasks;
  if (!hasAny) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        アーティファクトなし
      </div>
    );
  }

  const content = artifacts[activeTab];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b bg-white shrink-0">
        {TABS.map((tab) => {
          const exists = artifacts[tab.id] !== null;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600"
                  : exists
                    ? "border-transparent text-gray-600 hover:text-gray-800"
                    : "border-transparent text-gray-300 cursor-default"
              }`}
              disabled={!exists}
            >
              {tab.label}
              {exists && <span className="ml-1 text-green-500">*</span>}
            </button>
          );
        })}
      </div>
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        {content ? (
          <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">{content}</pre>
        ) : (
          <div className="text-gray-400 text-sm">未生成</div>
        )}
      </div>
    </div>
  );
}
