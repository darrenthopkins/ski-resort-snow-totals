import React from "react";

type Props = {
  children: React.ReactNode;
  route: string;
};

type State = {
  error: Error | null;
};

export class DiagnosticErrorBoundary extends React.Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          padding: 16,
          background: "#111",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 14,
        }}
      >
        <h1 style={{ fontSize: 18, margin: "0 0 12px" }}>
          Lift could not render this screen
        </h1>
        <p style={{ margin: 0 }}>
          Please close and reopen the app. Route: {this.props.route}
        </p>
      </div>
    );
  }
}
