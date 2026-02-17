import { query } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../logger.ts";

export function simpleSlugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-$/, "");

  return slug || "task";
}

export function isAsciiTitle(title: string): boolean {
  const trimmed = title.trim();
  if (trimmed.length === 0) return false;
  return /^[a-zA-Z0-9\s\-_]+$/.test(trimmed);
}

export type SlugGenerator = (prompt: string) => Promise<string>;

async function queryHaiku(prompt: string): Promise<string> {
  const end = logger.startTimer();
  let result = "";
  for await (const message of query({
    prompt,
    options: {
      model: "haiku",
      allowedTools: [],
      maxTurns: 1,
    },
  })) {
    if (message.type === "result" && message.subtype === "success") {
      result = message.result;
      const llmContext: Record<string, unknown> = {
        "gen_ai.operation.name": "slugify",
        "gen_ai.request.model": "haiku",
      };
      if (message.total_cost_usd != null) {
        llmContext["gen_ai.estimated_cost_usd"] = message.total_cost_usd;
      }
      if (message.usage) {
        const usage = message.usage as Record<string, number>;
        if (usage.input_tokens != null)
          llmContext["gen_ai.usage.input_tokens"] = usage.input_tokens;
        if (usage.output_tokens != null)
          llmContext["gen_ai.usage.output_tokens"] = usage.output_tokens;
      }
      end("info", "Slug generation completed", llmContext);
    }
  }
  return result;
}

export async function _generateSlugWithGenerator(
  title: string,
  generator: SlugGenerator,
): Promise<string> {
  if (isAsciiTitle(title)) {
    return simpleSlugify(title);
  }

  try {
    const text = await generator(
      `Convert this task title to a short English slug (lowercase, hyphens only, max 30 chars, no explanation). Title: ${title}`,
    );
    return simpleSlugify(text);
  } catch {
    return "task";
  }
}

export async function generateSlug(title: string): Promise<string> {
  return _generateSlugWithGenerator(title, queryHaiku);
}
