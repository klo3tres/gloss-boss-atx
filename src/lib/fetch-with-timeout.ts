/**
 * Fetch with a hard wall-clock timeout so UI never waits forever on hung routes.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 10000, signal: outer, ...rest } = init;
  const ac = new AbortController();
  const onOuterAbort = () => ac.abort();
  if (outer) {
    if (outer.aborted) ac.abort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(input, { ...rest, signal: ac.signal });
  } finally {
    clearTimeout(tid);
    outer?.removeEventListener('abort', onOuterAbort);
  }
}
