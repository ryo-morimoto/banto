import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Task, Project } from "../../shared/types.ts";
import { logStore } from "./log-store.ts";

// The Agent SDK resolves the CLI path from its own location by default,
// but under bun compile this points to the virtual FS (/$bunfs/root/cli.js).
// A relative path like "claude" fails the SDK's existsSync check too,
// so we require an absolute path via CLAUDE_CODE_EXECUTABLE env var.
function resolveClaudeExecutable(): string {
  const path = process.env.CLAUDE_CODE_EXECUTABLE;
  if (!path) {
    throw new Error("CLAUDE_CODE_EXECUTABLE env var is required");
  }
  return path;
}

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
  attachmentPaths?: string[];
  onSessionId: (id: string) => void;
  signal?: AbortSignal;
  cwd?: string;
}): Promise<AgentResult> {
  const parts = [opts.task.title, opts.task.description].filter(Boolean);
  if (opts.attachmentPaths && opts.attachmentPaths.length > 0) {
    parts.push(
      "The following screenshot images are attached for reference. Use the Read tool to view them:",
      ...opts.attachmentPaths.map((p) => `- ${p}`),
    );
  }
  const prompt = parts.join("\n\n");

  const abortController = new AbortController();
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => abortController.abort());
  }

  let sessionId = "";

  pushLog(opts.bantoSessionId, "status", "Agent starting...");

  const response = query({
    prompt,
    options: {
      cwd: opts.cwd ?? opts.project.localPath,
      allowedTools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      abortController,
      settingSources: ["project"],
      pathToClaudeCodeExecutable: resolveClaudeExecutable(),
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append: `You are an autonomous coding agent. Complete the task thoroughly. You are already on branch "${opts.branch}".`,
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
