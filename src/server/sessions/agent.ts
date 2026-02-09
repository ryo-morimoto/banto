import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Task, Project } from "@/shared/types.ts";
import { logStore } from "./log-store.ts";

export interface AgentResult {
  sessionId: string;
  success: boolean;
  error?: string;
}

function pushLog(
  bantoSessionId: string,
  type: "text" | "tool" | "error" | "status",
  content: string,
) {
  logStore.push(bantoSessionId, {
    timestamp: new Date().toISOString(),
    type,
    content,
  });
}

export async function runAgent(opts: {
  bantoSessionId: string;
  task: Task;
  project: Project;
  branch: string;
  onSessionId: (id: string) => void;
  signal?: AbortSignal;
}): Promise<AgentResult> {
  const prompt = [opts.task.title, opts.task.description].filter(Boolean).join("\n\n");

  const abortController = new AbortController();
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => abortController.abort());
  }

  let sessionId = "";

  pushLog(opts.bantoSessionId, "status", "Agent starting...");

  const response = query({
    prompt: `You are working on a task. Create a git branch named "${opts.branch}" and work on it.\n\n${prompt}`,
    options: {
      cwd: opts.project.localPath,
      allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      abortController,
      settingSources: ["project"],
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: `You are an autonomous coding agent. Complete the task thoroughly. Work on branch "${opts.branch}".`,
      },
    },
  });

  try {
    for await (const message of response) {
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
        opts.onSessionId(sessionId);
        pushLog(opts.bantoSessionId, "status", `Session initialized: ${sessionId}`);
      }

      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if ("text" in block) {
            pushLog(opts.bantoSessionId, "text", block.text);
          } else if ("name" in block) {
            pushLog(opts.bantoSessionId, "tool", `Tool: ${block.name}`);
          }
        }
      }

      if (message.type === "result") {
        const success = message.subtype === "success";
        pushLog(
          opts.bantoSessionId,
          "status",
          success ? "Agent completed successfully" : `Agent ended: ${message.subtype}`,
        );
        return {
          sessionId,
          success,
          error: success ? undefined : `Agent ended with: ${message.subtype}`,
        };
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    pushLog(opts.bantoSessionId, "error", errorMsg);
    return { sessionId, success: false, error: errorMsg };
  }

  pushLog(opts.bantoSessionId, "status", "Agent completed");
  return { sessionId, success: true };
}
