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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorStatus(error: unknown): number {
  if (!isObject(error)) return 0;
  const status = error["status"];
  return typeof status === "number" ? status : 0;
}

function getErrorMessage(error: unknown): string {
  if (!isObject(error)) return String(error);
  const value = error["value"];
  if (!isObject(value)) return String(value);
  const payloadError = value["error"];
  if (!isObject(payloadError)) return String(value);
  const message = payloadError["message"];
  return typeof message === "string" ? message : String(value);
}

export function unwrap<T>(result: { data: T | null; error: unknown; response: Response }): T {
  if (result.error) {
    const requestId = result.response?.headers?.get("x-request-id") ?? null;
    throw new ApiError(getErrorStatus(result.error), getErrorMessage(result.error), requestId);
  }

  if (result.data === null) {
    throw new ApiError(
      result.response.status,
      "Empty API response",
      result.response?.headers?.get("x-request-id") ?? null,
    );
  }

  return result.data;
}
