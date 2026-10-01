import React from "react";

/** Last-resort crash screen. Shows no internals to the user; logs to console for developers. */
export class ErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Hook an error reporter (e.g. Sentry) in here. Don't send plan data — it's financial PII.
    console.error("Unhandled UI error", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="narrow" style={{ paddingTop: 60 }}>
        <h1 className="page-title">Something went wrong</h1>
        <p className="mut">Your saved data is safe. Reload the page to continue.</p>
        <button type="button" className="btn pri" onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
}
