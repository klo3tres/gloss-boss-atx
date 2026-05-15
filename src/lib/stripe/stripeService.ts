import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';

const KEYS = {
  secret: 'stripe_secret_key',
  webhook: 'stripe_webhook_secret',
  publishable: 'stripe_publishable_key',
} as const;

export type StripeSecrets = {
  secretKey: string | null;
  webhookSecret: string | null;
  publishableKey: string | null;
  source: 'env' | 'database' | 'none';
};

/**
 * Load Stripe keys: environment variables first (Vercel-friendly), then Supabase `settings` table.
 * Never throws. Never call from client components.
 */
export async function getStripeSecrets(admin: SupabaseClient | null): Promise<StripeSecrets> {
  const envSecret = process.env.STRIPE_SECRET_KEY?.trim() || null;
  const envWebhook = process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
  const envPub = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;

  if (envSecret) {
    return {
      secretKey: envSecret,
      webhookSecret: envWebhook,
      publishableKey: envPub,
      source: 'env',
    };
  }

  if (!admin) {
    return { secretKey: null, webhookSecret: null, publishableKey: null, source: 'none' };
  }

  try {
    const { data, error } = await admin.from('settings').select('key, value').in('key', [KEYS.secret, KEYS.webhook, KEYS.publishable]);

    if (error) {
      console.warn('[stripeService] settings read failed', error.message);
      return { secretKey: null, webhookSecret: null, publishableKey: null, source: 'none' };
    }

    const map = new Map((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const secretKey = map.get(KEYS.secret)?.trim() || null;
    const webhookSecret = map.get(KEYS.webhook)?.trim() || null;
    const publishableKey = map.get(KEYS.publishable)?.trim() || null;

    if (!secretKey) {
      return { secretKey: null, webhookSecret: null, publishableKey: null, source: 'none' };
    }

    return { secretKey, webhookSecret, publishableKey, source: 'database' };
  } catch (e) {
    console.warn('[stripeService] getStripeSecrets', e);
    return { secretKey: null, webhookSecret: null, publishableKey: null, source: 'none' };
  }
}

export async function getStripeSdk(admin: SupabaseClient | null): Promise<Stripe | null> {
  const { secretKey } = await getStripeSecrets(admin);
  if (!secretKey) return null;
  try {
    return new Stripe(secretKey);
  } catch (e) {
    console.warn('[stripeService] Stripe SDK init failed', e);
    return null;
  }
}

export async function saveStripeSettings(
  admin: SupabaseClient | null,
  partial: { secretKey?: string; webhookSecret?: string; publishableKey?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!admin) {
    return { ok: false, error: 'Database admin client unavailable' };
  }

  const now = new Date().toISOString();
  const rows: { key: string; value: string; updated_at: string }[] = [];

  if (partial.secretKey !== undefined) {
    rows.push({ key: KEYS.secret, value: partial.secretKey.trim(), updated_at: now });
  }
  if (partial.webhookSecret !== undefined) {
    rows.push({ key: KEYS.webhook, value: partial.webhookSecret.trim(), updated_at: now });
  }
  if (partial.publishableKey !== undefined) {
    rows.push({ key: KEYS.publishable, value: partial.publishableKey.trim(), updated_at: now });
  }

  if (rows.length === 0) {
    return { ok: true };
  }

  try {
    const { error } = await admin.from('settings').upsert(rows, { onConflict: 'key' });
    if (error) {
      console.warn('[stripeService] saveStripeSettings', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'save failed' };
  }
}

export async function getStripeSettingsFlags(admin: SupabaseClient | null): Promise<{
  envHasSecret: boolean;
  envHasPublishable: boolean;
  envHasWebhook: boolean;
  dbHasSecret: boolean;
  dbHasWebhook: boolean;
  dbHasPublishable: boolean;
  stripeMode: 'live' | 'test' | 'unknown' | 'unset';
}> {
  const envHasSecret = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const envHasPublishable = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
  const envHasWebhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());

  const secrets = await getStripeSecrets(admin);
  const sk = secrets.secretKey;
  let stripeMode: 'live' | 'test' | 'unknown' | 'unset' = 'unset';
  if (sk) {
    if (sk.startsWith('sk_live')) stripeMode = 'live';
    else if (sk.startsWith('sk_test')) stripeMode = 'test';
    else stripeMode = 'unknown';
  }

  if (!admin) {
    return { envHasSecret, envHasPublishable, envHasWebhook, dbHasSecret: false, dbHasWebhook: false, dbHasPublishable: false, stripeMode };
  }
  try {
    const { data, error } = await admin.from('settings').select('key').in('key', [KEYS.secret, KEYS.webhook, KEYS.publishable]);
    if (error) {
      console.warn('[stripeService] settings flags read failed', error.message);
      return { envHasSecret, envHasPublishable, envHasWebhook, dbHasSecret: false, dbHasWebhook: false, dbHasPublishable: false, stripeMode };
    }
    const set = new Set((data ?? []).map((r: { key: string }) => r.key));
    return {
      envHasSecret,
      envHasPublishable,
      envHasWebhook,
      dbHasSecret: set.has(KEYS.secret),
      dbHasWebhook: set.has(KEYS.webhook),
      dbHasPublishable: set.has(KEYS.publishable),
      stripeMode: envHasSecret || set.has(KEYS.secret) ? stripeMode : 'unset',
    };
  } catch {
    return { envHasSecret, envHasPublishable, envHasWebhook, dbHasSecret: false, dbHasWebhook: false, dbHasPublishable: false, stripeMode };
  }
}
