import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { ApiError } from "./api.ts";
import { reportErrorToServer } from "./ErrorBoundary.tsx";

function reportIfApiError(error: Error) {
  if (error instanceof ApiError) {
    reportErrorToServer(error.message, error.stack, error.requestId ?? undefined);
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: reportIfApiError,
  }),
  mutationCache: new MutationCache({
    onError: reportIfApiError,
  }),
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: false,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      },
      throwOnError: (error) => {
        if (error instanceof ApiError) return error.status >= 500;
        return true;
      },
    },
    mutations: {
      throwOnError: false,
    },
  },
});
