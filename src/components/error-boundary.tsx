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
import { useTranslation } from 'react-i18next';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** Raw Error.message when available; null when the thrown value wasn't an Error
   *  instance (ErrorFallback resolves the display text via a translated default). */
  message: string | null;
}

/**
 * Functional fallback UI rendered by the class-based ErrorBoundary below.
 * React error boundaries must be class components (hooks cannot implement
 * componentDidCatch / getDerivedStateFromError), so the useTranslation hook
 * cannot live directly in ErrorBoundary. This functional component is
 * rendered from ErrorBoundary.render() instead, giving it hook access.
 *
 * Default values are passed to t() as a safety net in case i18next itself
 * has failed to initialize when the error boundary fires.
 */
function ErrorFallback({ message, onReload }: { message: string | null; onReload: () => void }) {
  const { t } = useTranslation('common');
  const displayMessage = message ?? t('error.unexpectedError', 'An unexpected error occurred.');
  return (
    <div
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <h1 className="text-xl font-semibold text-destructive">
        {t('error.somethingWentWrong', 'Something went wrong')}
      </h1>
      <p className="max-w-md text-muted-foreground" style={{ fontSize: 'var(--text-body)' }}>{displayMessage}</p>
      <button
        type="button"
        onClick={onReload}
        className="rounded bg-primary px-4 py-2 font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        style={{ fontSize: 'var(--text-label)' }}
      >
        {t('error.reloadPage', 'Reload page')}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: null };
  }

  static getDerivedStateFromError(error: unknown): State {
    // Static lifecycle methods cannot use hooks — the display fallback text
    // is resolved in ErrorFallback (via t()) when message is null, not here.
    const message = error instanceof Error ? error.message : null;
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
      return <ErrorFallback message={this.state.message} onReload={this.handleReload} />;
    }

    return this.props.children;
  }
}
