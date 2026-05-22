import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/auth/require-profile-role';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/safeClient.server';
import { resendConfigured, twilioConfigured, businessNotifyDestination } from '@/lib/email-send';
import { twilioMessagingServiceSid, twilioFromNumber } from '@/lib/twilio-config';

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
  const businessInboxReady = Boolean(businessNotifyDestination());

  const envChecklist: Array<{ key: string; ok: boolean; tier: 'required' | 'recommended' | 'optional'; detail: string }> = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()), tier: 'required', detail: 'Public Supabase project URL' },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()), tier: 'required', detail: 'Browser / RLS client' },
    { key: 'SUPABASE_SERVICE_ROLE_KEY', ok: serviceRole, tier: 'required', detail: 'Server booking, webhooks, admin writes' },
    { key: 'NEXT_PUBLIC_APP_URL', ok: Boolean(process.env.NEXT_PUBLIC_APP_URL?.trim()), tier: 'recommended', detail: 'Stripe return URLs & webhook hints' },
    { key: 'STRIPE_SECRET_KEY', ok: Boolean(stripe.secretKey), tier: 'recommended', detail: 'Deposit checkout' },
    { key: 'STRIPE_WEBHOOK_SECRET', ok: webhookReady, tier: 'recommended', detail: 'Verify checkout.session.completed' },
    { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', ok: Boolean(stripe.publishableKey), tier: 'recommended', detail: 'Stripe.js' },
    { key: 'RESEND_API_KEY', ok: Boolean(process.env.RESEND_API_KEY?.trim()), tier: 'optional', detail: 'Transactional email' },
    { key: 'RESEND_FROM_EMAIL', ok: Boolean(process.env.RESEND_FROM_EMAIL?.trim()), tier: 'optional', detail: 'Verified sender' },
    {
      key: 'CONTACT_NOTIFY_EMAIL or BUSINESS_NOTIFY_EMAIL',
      ok: businessInboxReady,
      tier: 'optional',
      detail: 'Internal copy when customers book online',
    },
    { key: 'TWILIO_ACCOUNT_SID', ok: Boolean(process.env.TWILIO_ACCOUNT_SID?.trim()), tier: 'optional', detail: 'SMS' },
    { key: 'TWILIO_AUTH_TOKEN', ok: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()), tier: 'optional', detail: 'SMS' },
    { key: 'TWILIO_FROM_NUMBER', ok: Boolean(process.env.TWILIO_FROM_NUMBER?.trim()), tier: 'optional', detail: 'SMS sender' },
  ];

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
      messagingServiceConfigured: Boolean(twilioMessagingServiceSid()),
      fromNumberConfigured: Boolean(twilioFromNumber()),
      ready: twilioReady,
    },
    readiness: {
      stripe: stripeReady,
      stripeWebhook: webhookReady,
      resend: resendReady,
      twilio: twilioReady,
      supabaseServiceRole: serviceRole,
      businessNotifyEmail: businessInboxReady,
    },
    envChecklist,
    authNotes: {
      passwordReset:
        'Password reset email is controlled in the Supabase dashboard under Authentication → email templates and SMTP (not in this Next app env).',
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
