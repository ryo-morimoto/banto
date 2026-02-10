import { treaty } from "@elysiajs/eden";
import type { App } from "../server/app.ts";

export const api = treaty<App>(window.location.origin);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId: string | null,
  ) {
    super(message);
  }
}

export function unwrap<T>(result: { data: T | null; error: unknown; response: Response }): T {
  if (result.error) {
    const requestId = result.response?.headers?.get("x-request-id") ?? null;
    const value = (result.error as Record<string, unknown>).value as
      | { error?: { message?: string } }
      | undefined;
    const message = value?.error?.message ?? String(value);
    throw new ApiError(
      ((result.error as Record<string, unknown>).status as number) ?? 0,
      message,
      requestId,
    );
  }
  return result.data as T;
}
