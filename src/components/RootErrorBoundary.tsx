import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
  errorStack: string;
}

/**
 * RootErrorBoundary — top-level safety net so a single component crash never
 * leaves the entire page blank.  Renders a minimal, styled recovery screen
 * instead of a white void.
 */
export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, errorMessage: '', errorStack: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? String(error),
      errorStack: error?.stack ?? '',
    };
  }

  componentDidCatch(error: Error) {
    console.error('[Orchid Continuum] Root error caught by RootErrorBoundary', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen flex-col items-center justify-center bg-[#1a2e1a] px-6 py-20 text-[#f5f0e8]"
          style={{ fontFamily: '"Cormorant Garamond", Georgia, serif' }}
        >
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-[#c9a24a]">
            Orchid Continuum · Diagnostic
          </p>
          <h1 className="mt-4 text-3xl font-medium leading-snug text-[#faf7f2]">
            Something went wrong
          </h1>
          <p className="mt-3 max-w-lg text-center text-base leading-relaxed text-[#e7dfd1]/80">
            The page encountered an unexpected error. Reload to recover — your
            data is safe.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 rounded-full border border-[#c9a24a]/60 bg-[#c9a24a]/10 px-7 py-3 font-mono text-xs uppercase tracking-[0.22em] text-[#faf7f2] hover:bg-[#c9a24a]/20"
          >
            Reload page
          </button>
          {import.meta.env.DEV && (
            <pre className="mt-8 max-w-3xl overflow-auto whitespace-pre-wrap rounded-xl border border-red-800/40 bg-black/50 p-4 text-left text-xs leading-5 text-red-300">
              {this.state.errorMessage}
              {'\n\n'}
              {this.state.errorStack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
