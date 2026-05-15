'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/**
 * Catches render errors in a subtree so a failed child does not blank the whole app.
 */
export class SafeRenderBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[STABILITY_DEBUG_RUNTIME]', 'react_render_error', {
      boundary: this.props.label ?? 'root',
      message: error.message,
      digest: (error as Error & { digest?: string }).digest,
      componentStack: info.componentStack?.slice(0, 800),
    });
    console.error('[SafeRenderBoundary]', this.props.label ?? 'root', error.message, info.componentStack?.slice(0, 800));
  }

  render() {
    if (this.state.error) {
      return (
        <main
          className='min-h-screen bg-black px-4 py-16 text-white'
          style={{ backgroundColor: '#000000', color: '#ffffff' }}
        >
          <div className='mx-auto max-w-lg rounded-2xl border border-amber-500/40 bg-zinc-950 p-6'>
            <p className='text-xs font-bold uppercase tracking-[0.2em] text-amber-200'>Gloss Boss ATX</p>
            <h1 className='mt-3 text-xl font-black uppercase'>Something went wrong</h1>
            <p className='mt-2 text-sm text-zinc-400'>
              {this.props.label ? `${this.props.label}: ` : ''}
              The page hit an unexpected error. You can reload or return home.
            </p>
            <p className='mt-2 font-mono text-xs text-red-300/90'>{this.state.error.message}</p>
            <div className='mt-6 flex flex-wrap gap-3'>
              <button
                type='button'
                onClick={() => this.setState({ error: null })}
                className='rounded-lg bg-[#d4af37] px-4 py-2 text-xs font-bold uppercase tracking-wider text-black'
              >
                Try again
              </button>
              <a href='/' className='rounded-lg border border-white/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white'>
                Home
              </a>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
