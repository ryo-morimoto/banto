import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { ApiError } from "./api.ts";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportErrorToServer(
      error.message,
      info.componentStack ?? error.stack,
      error instanceof ApiError ? (error.requestId ?? undefined) : undefined,
    );
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-4">
            <p className="text-red-600 text-sm font-medium">{this.state.error.message}</p>
            <button
              type="button"
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              onClick={() => this.setState({ error: null })}
            >
              再試行
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function reportErrorToServer(message: string, stack?: string, requestId?: string) {
  fetch("/api/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      stack,
      requestId,
      url: window.location.href,
    }),
  }).catch(() => {});
}
