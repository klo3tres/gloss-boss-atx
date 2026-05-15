'use client';

import { useEffect } from 'react';

function toAbsoluteStylesheetHref(link: HTMLLinkElement): string {
  const raw = link.getAttribute('href');
  if (!raw) return link.href;
  try {
    return new URL(raw, window.location.origin).href;
  } catch {
    return link.href;
  }
}

/**
 * Dev-only: console forwarding for hydration / chunk clues (no UI — recovery is GlobalRuntimeGuard).
 */
export function StabilityDiagnosticsClient() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const logRuntime = (step: string, payload?: Record<string, unknown>) => {
      console.info('[STABILITY_DEBUG_RUNTIME]', step, payload ?? {});
    };

    const origError = console.error;
    const origWarn = console.warn;

    const forwardIfReactIssue = (args: unknown[], sink: 'error' | 'warn') => {
      try {
        const text = args.map((a) => (typeof a === 'string' ? a : a instanceof Error ? a.message : String(a))).join(' ');
        if (
          /hydration|did not match|Hydration failed|server HTML|Expected server|Text content does not match|There was an error while hydrating/i.test(
            text,
          )
        ) {
          logRuntime('possible_hydration_mismatch_console', { sink, text: text.slice(0, 1200) });
        }
        if (/ChunkLoadError|Loading chunk \d+ failed|Importing a module script failed|Failed to fetch dynamically imported module/i.test(text)) {
          logRuntime('chunk_module_console', { sink, text: text.slice(0, 800) });
        }
      } catch {
        /* ignore */
      }
    };

    console.error = (...args: unknown[]) => {
      forwardIfReactIssue(args, 'error');
      origError.apply(console, args as []);
    };
    console.warn = (...args: unknown[]) => {
      forwardIfReactIssue(args, 'warn');
      origWarn.apply(console, args as []);
    };

    const onWindowError = (event: ErrorEvent) => {
      const msg = event.message ?? '';
      if (!msg && !event.filename) return;
      logRuntime('window_error', {
        message: msg,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
      if (
        /ChunkLoadError|Loading chunk \d+ failed|Importing a module script failed|Failed to fetch dynamically imported module|Cannot find module|MODULE_NOT_FOUND/i.test(
          msg,
        )
      ) {
        logRuntime('chunk_module_or_import_failure', {
          message: msg,
          filename: event.filename,
          hint: 'Use GlobalRuntimeGuard UI + npm run dev:clean on http://localhost:3000 only.',
        });
      }
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const str = typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : String(reason);
      logRuntime('unhandledrejection', { reason: str.slice(0, 800) });
      if (/chunk|Loading chunk|dynamically imported|Failed to fetch|MODULE_NOT_FOUND|Cannot find module/i.test(str)) {
        logRuntime('unhandledrejection_asset_or_module', { reason: str.slice(0, 800) });
      }
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);

    const headLinks = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    const docLinks = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
    const inHead = headLinks.length;
    const inDocument = docLinks.length;
    const hrefs = docLinks.map(toAbsoluteStylesheetHref);

    const hint =
      inDocument === 0
        ? 'No stylesheet links — run npm run dev:clean; open http://localhost:3000 only; hard refresh.'
        : undefined;

    console.info('[STABILITY_DEBUG]', {
      css_links_count: inDocument,
      css_links_in_head_count: inHead,
      css_404_count: null,
      note: 'HEAD checks skipped (dev servers may block HEAD on /_next/static).',
      stylesheet_hrefs: hrefs,
      ...(hint ? { hint } : {}),
    });

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  return null;
}
