export function pushoverConfigured(): boolean {
  return Boolean(process.env.PUSHOVER_APP_TOKEN?.trim() && process.env.PUSHOVER_USER_KEY?.trim());
}

export type PushoverResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  requestId?: string;
  status?: number;
};

export async function sendPushoverNotification(params: {
  title: string;
  message: string;
  url?: string;
  priority?: 0 | 1 | 2;
  /** Per-user Pushover key (staff). Falls back to PUSHOVER_USER_KEY env. */
  userKey?: string;
}): Promise<PushoverResult> {
  const token = process.env.PUSHOVER_APP_TOKEN?.trim();
  const userKey = params.userKey?.trim() || process.env.PUSHOVER_USER_KEY?.trim();
  if (!token || !userKey) {
    return { ok: false, skipped: true, error: 'Pushover not configured (PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY).' };
  }

  const body = new URLSearchParams();
  body.set('token', token);
  body.set('user', userKey);
  body.set('title', params.title.slice(0, 250));
  body.set('message', params.message.slice(0, 1024));
  if (params.url) body.set('url', params.url);
  if (params.priority != null) body.set('priority', String(params.priority));

  try {
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const text = await res.text();
    let json: { status?: number; request?: string; errors?: string[] } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* raw */
    }
    if (!res.ok || json.status !== 1) {
      const err = json.errors?.join(', ') || text.slice(0, 300) || `HTTP ${res.status}`;
      console.warn('[pushover] send failed', err);
      return { ok: false, error: err, status: res.status };
    }
    return { ok: true, requestId: json.request, status: res.status };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'Pushover request failed';
    console.warn('[pushover]', err);
    return { ok: false, error: err };
  }
}
