import { Component } from "react";

// Catches errors thrown while rendering its children and shows a fallback
// instead of letting React unmount the whole app (the "black screen").
// Must be a class: there is no hook equivalent of getDerivedStateFromError.
// Does NOT catch errors in event handlers or async code (fetch) — those are
// handled where they happen, via request() in api.js.
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="h-screen flex flex-col items-center justify-center text-center px-6 bg-console-bg text-console-text">
        <p className="text-sm mb-1">Something went wrong</p>
        <p className="text-console-muted text-xs font-mono max-w-xs mb-4">
          The page hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="font-mono text-xs uppercase tracking-wider text-console-amber border border-console-amber/30 rounded-full px-3 py-1.5 hover:bg-console-amber/10 transition-colors"
        >
          Reload
        </button>
      </div>
    );
  }
}
