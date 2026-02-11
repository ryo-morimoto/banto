import "./global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, QueryErrorResetBoundary } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "../src/client/queryClient.ts";
import { router } from "../src/client/router.ts";
import { ErrorBoundary, reportErrorToServer } from "../src/client/ErrorBoundary.tsx";
import { ApiError } from "../src/client/api.ts";

window.addEventListener("unhandledrejection", (event) => {
  const err = event.reason;
  reportErrorToServer(
    err?.message ?? String(err),
    err?.stack,
    err instanceof ApiError ? (err.requestId ?? undefined) : undefined,
  );
});

window.addEventListener("error", (event) => {
  reportErrorToServer(event.message, event.error?.stack);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <ErrorBoundary onReset={reset}>
            <RouterProvider router={router} />
          </ErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
