'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; label: string };
type State = { error: Error | null };

/**
 * Isolates homepage sections so one failing widget cannot blank the entire marketing page.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[RENDER_DEBUG]', JSON.stringify({ step: 'section_error', label: this.props.label, message: error.message, info: info.componentStack?.slice(0, 500) }));
  }

  render() {
    if (this.state.error) {
      return (
        <div className='rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 text-center'>
          <p className='text-xs font-bold uppercase tracking-[0.2em] text-amber-200'>Gloss Boss ATX</p>
          <p className='mt-2 text-sm text-zinc-300'>
            This section is temporarily unavailable ({this.props.label}). The rest of the site should still work — refresh the page or try again later.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
