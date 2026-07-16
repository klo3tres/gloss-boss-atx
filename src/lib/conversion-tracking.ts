'use client';

function sessionId() {
  const key = 'gb_conversion_session';
  let value = window.sessionStorage.getItem(key);
  if (!value) { value = crypto.randomUUID(); window.sessionStorage.setItem(key, value); }
  return value;
}

export function trackConversionEvent(eventType: string, metadata: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const body = JSON.stringify({ eventType, sessionId: sessionId(), sourcePath: window.location.pathname, metadata });
  if (navigator.sendBeacon) navigator.sendBeacon('/api/public/conversion-event', new Blob([body], { type: 'application/json' }));
  else void fetch('/api/public/conversion-event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
}
