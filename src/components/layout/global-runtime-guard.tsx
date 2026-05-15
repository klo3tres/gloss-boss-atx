'use client';

import { useCallback, useEffect, useState } from 'react';

function isChunkOrModuleFailure(message: string): boolean {
  return /ChunkLoadError|Loading chunk \d+ failed|Importing a module script failed|Failed to fetch dynamically imported module|Cannot find module|MODULE_NOT_FOUND|Unexpected token '<'|expected expression, got '<'|MIME type \("text\/html"\) is not executable/i.test(
    message,
  );
}

/**
 * Last-resort UI when JS chunks fail to load (mixed builds) so the user never sees a blank window.
 * Uses inline styles so this still renders if the Tailwind CSS chunk is the one that failed.
 */
export function GlobalRuntimeGuard() {
  const [broken, setBroken] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const arm = useCallback((msg: string) => {
    if (!isChunkOrModuleFailure(msg)) return;
    setDetail(msg.slice(0, 280));
    setBroken(true);
  }, []);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      arm(event.message ?? '');
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const r = event.reason;
      const str = typeof r === 'string' ? r : r instanceof Error ? r.message : String(r);
      arm(str);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [arm]);

  if (!broken) return null;

  return (
    <div
      role='alert'
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        background: '#050505',
        color: '#f4f4f5',
        fontFamily: 'system-ui,Segoe UI,Roboto,sans-serif',
      }}
    >
      <p style={{ fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#d4af37', margin: 0 }}>Gloss Boss ATX</p>
      <h1 style={{ margin: '16px 0 8px', fontSize: 22, fontWeight: 800, textTransform: 'uppercase' }}>Gloss Boss is loading</h1>
      <p style={{ margin: '0 0 8px', maxWidth: 420, fontSize: 14, lineHeight: 1.5, color: '#a1a1aa' }}>
        A script update did not load correctly (often after switching dev servers or builds). Refresh this page. If it keeps happening, stop all Node
        processes, run <code style={{ color: '#fde68a' }}>npm run dev:clean</code>, open only{' '}
        <code style={{ color: '#fde68a' }}>http://localhost:3000</code>, then hard refresh.
      </p>
      {detail ? (
        <p style={{ margin: '12px 0 0', maxWidth: 520, fontSize: 11, color: '#71717a', wordBreak: 'break-word' }}>{detail}</p>
      ) : null}
      <div style={{ marginTop: 28, display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        <button
          type='button'
          onClick={() => window.location.reload()}
          style={{
            cursor: 'pointer',
            border: 'none',
            borderRadius: 8,
            padding: '12px 22px',
            fontSize: 12,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            background: '#d4af37',
            color: '#000',
          }}
        >
          Retry
        </button>
        <a
          href='/'
          style={{
            display: 'inline-block',
            borderRadius: 8,
            padding: '12px 22px',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            border: '1px solid rgba(212,175,55,0.55)',
            color: '#d4af37',
            textDecoration: 'none',
          }}
        >
          Home
        </a>
      </div>
    </div>
  );
}
