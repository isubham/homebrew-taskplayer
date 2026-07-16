import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Development: Show the detailed stack trace on screen
      if (import.meta.env.DEV) {
        return (
          <div style={{ padding: "24px", background: "#330000", color: "#ff9999", minHeight: "100vh", fontFamily: "monospace", zIndex: 9999, position: "relative" }}>
            <h1 style={{ fontSize: "20px", marginBottom: "16px", color: "#ff4444" }}>React Rendering Error</h1>
            <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>{this.state.error?.toString()}</h2>
            <pre style={{ background: "#220000", padding: "16px", borderRadius: "8px", overflowX: "auto", whiteSpace: "pre-wrap", fontSize: "12px" }}>
              {this.state.errorInfo?.componentStack || this.state.error?.stack}
            </pre>
            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button 
                onClick={() => window.location.reload()} 
                style={{ padding: "8px 16px", background: "#ff4444", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Reload Application
              </button>
              <button
                onClick={(e) => {
                  navigator.clipboard.writeText(`${this.state.error?.toString()}\n\n${this.state.errorInfo?.componentStack || this.state.error?.stack}`);
                  const btn = e.currentTarget;
                  const original = btn.innerText;
                  btn.innerText = "Copied!";
                  setTimeout(() => btn.innerText = original, 2000);
                }}
                style={{ padding: "8px 16px", background: "#555555", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
              >
                Copy Error
              </button>
            </div>
          </div>
        );
      }

      // Production: Show a graceful fallback
      return (
        <div style={{ padding: "40px", textAlign: "center", fontFamily: "sans-serif", color: "var(--fg, #333)", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <h2>Something went wrong.</h2>
          <p style={{ margin: "16px 0", color: "var(--muted, #666)" }}>An unexpected error occurred in the application.</p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ padding: "8px 16px", background: "var(--primary, #007bff)", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            Restart App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
