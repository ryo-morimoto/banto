import { query } from "@anthropic-ai/claude-agent-sdk";

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
