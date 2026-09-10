import { Component } from "react";
import { reportCrash } from "@/utils/crashReporter";

// Catches render-time crashes anywhere below it — including a provider throwing during
// its own first render (this app has hit exactly that: ClerkProvider crashing on a
// missing key used to just leave a blank screen with nothing but a console warning
// suggesting "add an error boundary"). Must be a class component; React has no hook
// equivalent for componentDidCatch/getDerivedStateFromError.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportCrash({
      message: error?.message,
      stack: error?.stack,
      componentStack: info?.componentStack,
      source: "boundary",
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16, padding: 24,
        background: "#0A0A0F", color: "#F0F0F5", textAlign: "center", fontFamily: "sans-serif",
      }}>
        <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Something went wrong.</p>
        <p style={{ fontSize: 14, color: "#8888A0", margin: 0, maxWidth: 320 }}>
          We've been notified. Reloading usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, padding: "12px 32px", borderRadius: 999, border: "none",
            background: "#E8FF47", color: "#0A0A0F", fontWeight: 700, fontSize: 14, cursor: "pointer",
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
