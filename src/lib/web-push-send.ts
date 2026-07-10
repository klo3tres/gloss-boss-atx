import type { SupabaseClient } from '@supabase/supabase-js';

export function webPushConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      (process.env.VAPID_SUBJECT?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim()),
  );
}

export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendWebPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; skipped: boolean; error?: string }> {
  if (!webPushConfigured()) {
    return { sent: 0, failed: 0, skipped: true, error: 'Web push not configured (VAPID keys).' };
  }

  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId);
  if (!subs?.length) return { sent: 0, failed: 0, skipped: true, error: 'No push subscriptions.' };

  let webpush: typeof import('web-push');
  try {
    webpush = await import('web-push');
  } catch {
    return { sent: 0, failed: 0, skipped: true, error: 'web-push package unavailable.' };
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || `mailto:${process.env.RESEND_FROM_EMAIL || 'alerts@glossbossatx.com'}`,
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );

  const body = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 500),
    url: payload.url ?? '/tech',
    tag: payload.tag ?? 'gloss-boss-job',
  });

  let sent = 0;
  let failed = 0;
  const staleEndpoints: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: String(sub.endpoint),
          keys: { p256dh: String(sub.p256dh), auth: String(sub.auth) },
        },
        body,
      );
      sent += 1;
    } catch (e: unknown) {
      failed += 1;
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) staleEndpoints.push(String(sub.endpoint));
      console.warn('[web-push] send failed', status, e instanceof Error ? e.message : e);
    }
  }

  if (staleEndpoints.length > 0) {
    await admin.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', staleEndpoints);
  }

  return { sent, failed, skipped: false };
}
