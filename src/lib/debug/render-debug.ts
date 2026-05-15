/**
 * Client-safe render diagnostics (dashboard shell, role gate, etc.).
 */
export function logRenderDebug(payload: Record<string, unknown>): void {
  try {
    console.info('[RENDER_DEBUG]', JSON.stringify({ ...payload, t: new Date().toISOString() }));
  } catch {
    console.info('[RENDER_DEBUG]', payload);
  }
}
