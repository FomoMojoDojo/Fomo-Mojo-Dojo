import React from "react";
import { Link } from "react-router-dom";

type AppErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
};

export default class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown) {
    // Keep this log for local debugging and support tickets.
    console.error("[app-error-boundary]", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-ink flex items-center justify-center px-4">
        <div className="w-full max-w-2xl rounded-xl border border-white/20 bg-white/5 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#aeb6d5]">
            Runtime Error
          </p>
          <h1 className="mt-2 font-serif text-[24px] text-[#f3f6ff]">
            The page hit an unexpected error.
          </h1>
          <p className="mt-3 font-mono text-[12px] text-[#c8d1ef]">
            {this.state.errorMessage || "Unknown runtime error"}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md border border-white/20 bg-white/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#eaf0ff] hover:bg-white/15"
            >
              Reload
            </button>
            <Link
              to="/"
              className="rounded-md border border-white/20 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#d7def8] hover:bg-white/10"
            >
              Go to Home
            </Link>
            <Link
              to="/admin"
              className="rounded-md border border-white/20 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[#d7def8] hover:bg-white/10"
            >
              Go to Admin
            </Link>
          </div>
        </div>
      </div>
    );
  }
}

