import { getStripeSecrets } from '@/lib/stripe/stripeService';

export type StripeKeyHealth = {
  configured: boolean;
  secretMode: 'live' | 'test' | 'unknown';
  publishableMode: 'live' | 'test' | 'unknown' | 'missing';
  mismatch: boolean;
  mismatchDetail: string | null;
  source: string;
};

function modeFromKey(key: string | null | undefined): 'live' | 'test' | 'unknown' | 'missing' {
  if (!key) return 'missing';
  if (key.startsWith('sk_live_') || key.startsWith('pk_live_')) return 'live';
  if (key.startsWith('sk_test_') || key.startsWith('pk_test_')) return 'test';
  return 'unknown';
}

/** Detect live/test key mismatch (common Vercel production misconfiguration). */
export async function getStripeKeyHealth(admin: Parameters<typeof getStripeSecrets>[0]): Promise<StripeKeyHealth> {
  const secrets = await getStripeSecrets(admin);
  const secretMode = modeFromKey(secrets.secretKey);
  const publishableMode = modeFromKey(secrets.publishableKey);

  let mismatch = false;
  let mismatchDetail: string | null = null;
  if (
    secretMode === 'live' &&
    publishableMode === 'test'
  ) {
    mismatch = true;
    mismatchDetail = 'Server uses Stripe LIVE secret but publishable key is TEST — checkout may fail for customers.';
  } else if (secretMode === 'test' && publishableMode === 'live') {
    mismatch = true;
    mismatchDetail = 'Server uses Stripe TEST secret but publishable key is LIVE.';
  }

  return {
    configured: Boolean(secrets.secretKey),
    secretMode: secretMode === 'missing' ? 'unknown' : secretMode,
    publishableMode,
    mismatch,
    mismatchDetail,
    source: secrets.source,
  };
}
