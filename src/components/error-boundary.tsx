/**
 * Global error boundary — catches uncaught React render errors anywhere in the
 * component tree and shows a recovery UI instead of a blank page.
 *
 * React error boundaries must be class components (hooks cannot implement
 * componentDidCatch / getDerivedStateFromError).  This is the only class
 * component in the project; everything else is functional.
 *
 * Why this exists (ARCHITECTURE.md Known gap #3): without an error boundary,
 * a render error in any component — including Leaflet's TileLayer throwing on
 * an unresolved {placeholder} — propagates to the root and unmounts the entire
 * app, leaving a blank page with no recovery path.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Log to the browser console so the operator can diagnose issues.
    // Does not send to any external service — no telemetry by default.
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <h1 className="text-xl font-semibold text-destructive">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">{this.state.message}</p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
