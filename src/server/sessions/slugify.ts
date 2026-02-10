import Anthropic from "@anthropic-ai/sdk";

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

export async function _generateSlugWithClient(
  title: string,
  client: Pick<Anthropic, "messages">,
): Promise<string> {
  if (isAsciiTitle(title)) {
    return simpleSlugify(title);
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 30,
      messages: [
        {
          role: "user",
          content: `Convert this task title to a short English slug (lowercase, hyphens only, max 30 chars, no explanation). Title: ${title}`,
        },
      ],
    });

    const text = response.content[0];
    if (text && "text" in text) {
      return simpleSlugify(text.text);
    }
    return "task";
  } catch {
    return "task";
  }
}

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export async function generateSlug(title: string): Promise<string> {
  return _generateSlugWithClient(title, getClient());
}
