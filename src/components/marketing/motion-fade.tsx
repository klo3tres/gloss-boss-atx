'use client';

/**
 * Visible-first wrapper: no Framer Motion here so a failed/blocked motion bundle
 * cannot leave the homepage looking like “background only”.
 * `delay` is kept for API compatibility with existing call sites.
 */
export function MotionFade({ children, delay: _delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return <div>{children}</div>;
}
