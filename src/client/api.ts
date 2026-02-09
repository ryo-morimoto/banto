import { treaty } from "@elysiajs/eden";
import type { App } from "@/server/app.ts";

export const api = treaty<App>(window.location.origin);
