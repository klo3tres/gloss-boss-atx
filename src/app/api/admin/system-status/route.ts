import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/auth/require-profile-role';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/safeClient.server';
import { resendConfigured, twilioConfigured } from '@/lib/email-send';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await tryCreateServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const gate = await requireProfileRoles(supabase, ['admin', 'super_admin']);
  if (!gate.ok) return gate.response;

  const admin = tryCreateAdminSupabase();
  const stripe = await getStripeSecrets(admin);

  const { error: pingErr } = await supabase.from('profiles').select('id').limit(1);
  const dbReachable = !pingErr;

  const serviceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const stripeReady = Boolean(stripe.secretKey);
  const webhookReady = Boolean(stripe.webhookSecret);
  const resendReady = resendConfigured();
  const twilioReady = twilioConfigured();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    actorRole: gate.role,
    supabase: {
      configured: true,
      databaseReachable: dbReachable,
      databaseError: pingErr?.message ?? null,
    },
    env: {
      nextPublicAppUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || null,
      nextPublicSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()),
      nextPublicSupabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()),
      supabaseServiceRoleKey: serviceRole,
    },
    stripe: {
      secretConfigured: Boolean(stripe.secretKey),
      webhookSecretConfigured: webhookReady,
      publishableConfigured: Boolean(stripe.publishableKey),
      keySource: stripe.source,
      mode:
        stripe.secretKey?.startsWith('sk_test') === true
          ? 'test'
          : stripe.secretKey?.startsWith('sk_live') === true
            ? 'live'
            : 'unknown',
    },
    resend: {
      apiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      fromEmailConfigured: Boolean(process.env.RESEND_FROM_EMAIL?.trim()),
      ready: resendReady,
    },
    twilio: {
      accountSidConfigured: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()),
      authTokenConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
      fromNumberConfigured: Boolean(process.env.TWILIO_FROM_NUMBER?.trim()),
      ready: twilioReady,
    },
    readiness: {
      stripe: stripeReady,
      stripeWebhook: webhookReady,
      resend: resendReady,
      twilio: twilioReady,
      supabaseServiceRole: serviceRole,
    },
    webhooks: {
      primaryUrlHint:
        (process.env.NEXT_PUBLIC_APP_URL?.trim() ? `${process.env.NEXT_PUBLIC_APP_URL.trim()}/api/stripe/webhook` : null) ??
        'Set NEXT_PUBLIC_APP_URL to show the canonical webhook URL.',
      legacyUrlHint:
        (process.env.NEXT_PUBLIC_APP_URL?.trim() ? `${process.env.NEXT_PUBLIC_APP_URL.trim()}/api/webhooks/stripe` : null) ??
        null,
    },
  });
}
