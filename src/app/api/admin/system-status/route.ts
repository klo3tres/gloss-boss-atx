import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/auth/require-profile-role';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/safeClient.server';
import { resendConfigured, twilioConfigured, businessNotifyDestination } from '@/lib/email-send';
import { twilioMessagingServiceSid, twilioFromNumber } from '@/lib/twilio-config';
import {
  appleAdvancedApiStatus,
  businessHomeBaseConfigured,
  googleMapsConfigured,
  openWeatherConfigured,
} from '@/lib/weather-config';

export const runtime = 'nodejs';

const LATEST_LOCAL_MIGRATION = '000139_financial_ledger_and_cancellation_integrity.sql';

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
  const appleAdvanced = appleAdvancedApiStatus();

  const schemaChecks = admin
    ? await Promise.all([
        admin.from('referral_rewards').select('issuance_key, eligibility, reserved_appointment_id, selected_addon_slug').limit(1),
        admin.from('loyalty_reset_events').select('id, consumed_punches, reset_behavior').limit(1),
        admin.from('notification_outbox').select('provider_status, delivered_at, status_updated_at').limit(1),
        admin.from('staff_invites').select('sms_delivery_status, sms_delivery_error, sms_delivery_updated_at').limit(1),
        admin.from('staff_invites').select('email_delivery_status, email_delivery_error, email_delivery_updated_at').limit(1),
        admin.from('appointments').select('technician_acknowledged_at, on_the_way_at, arrived_at, updated_eta_at, updated_eta_minutes, flexible_arrival').limit(1),
        admin.from('site_settings').select('key, value').eq('key', 'migration_marker_000139').maybeSingle(),
        admin.from('conversion_events').select('id, event_type, is_test').limit(1),
      ])
    : [];
  const rewardSchemaLabels = ['Referral reward lifecycle', 'Loyalty reset ledger', 'Twilio delivery truth', 'Staff invite SMS delivery truth', 'Staff invite email delivery truth', 'Late-job operational timestamps', 'Financial and cancellation integrity marker', 'Conversion funnel events'];
  const rewardSchemaChecks = schemaChecks.map((result, index) => {
    const marker = index === 6 ? result.data as { key?: string; value?: { name?: string; applied?: boolean; version?: number } } | null : null;
    const markerValid = index !== 6 || (
      marker?.key === 'migration_marker_000139'
      && marker.value?.name === 'financial_ledger_and_cancellation_integrity'
      && marker.value?.applied === true
      && marker.value?.version === 139
    );
    return {
      label: rewardSchemaLabels[index],
      ok: !result.error && markerValid,
      error: result.error?.message ?? (markerValid ? null : 'Migration marker is missing or invalid'),
    };
  });
  const rewardLifecycleReady = Boolean(admin) && rewardSchemaChecks.slice(0, 4).length === 4 && rewardSchemaChecks.slice(0, 4).every((check) => check.ok);
  const notificationOperationsReady = Boolean(admin) && rewardSchemaChecks.slice(0, 6).length === 6 && rewardSchemaChecks.slice(0, 6).every((check) => check.ok);
  const migrationParityReady = notificationOperationsReady && rewardSchemaChecks[6]?.ok === true && rewardSchemaChecks[7]?.ok === true;
  const applicationCommit = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || process.env.NEXT_PUBLIC_APP_COMMIT?.trim() || 'local-uncommitted';

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

  const jobMediaBucket = process.env.JOB_MEDIA_BUCKET?.trim() || 'job-media';
  const galleryBucket = 'gallery';

  let jobMediaBucketExists = false;
  let galleryBucketExists = false;
  let serviceRoleUploadOk = false;
  let latestJobPhoto: { at: string | null; ok: boolean; detail: string } = { at: null, ok: false, detail: 'No uploads yet' };
  let latestGalleryRow: { at: string | null; ok: boolean; detail: string } = { at: null, ok: false, detail: 'No CMS gallery rows' };

  if (admin && serviceRole) {
    try {
      const buckets = await admin.storage.listBuckets();
      const names = new Set((buckets.data ?? []).map((b) => b.name));
      jobMediaBucketExists = names.has(jobMediaBucket);
      galleryBucketExists = names.has(galleryBucket);
      serviceRoleUploadOk = jobMediaBucketExists && galleryBucketExists;
    } catch (e) {
      console.warn('[system-status] buckets', e);
    }

    const photoRes = await admin
      .from('job_photos')
      .select('id, created_at, public_url, file_url')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!photoRes.error && photoRes.data) {
      const row = photoRes.data as { created_at?: string; public_url?: string; file_url?: string };
      const url = String(row.public_url || row.file_url || '');
      latestJobPhoto = {
        at: row.created_at ?? null,
        ok: Boolean(url),
        detail: url ? 'Latest job_photos row has URL' : 'Latest row missing public URL',
      };
    } else {
      const mediaRes = await admin
        .from('job_media')
        .select('id, created_at, public_url, file_url')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!mediaRes.error && mediaRes.data) {
        const row = mediaRes.data as { created_at?: string; public_url?: string; file_url?: string };
        latestJobPhoto = {
          at: row.created_at ?? null,
          ok: Boolean(row.public_url || row.file_url),
          detail: 'Latest job_media row',
        };
      }
    }

    const galRes = await admin
      .from('gallery_images')
      .select('id, created_at, url, image_url, featured, published')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!galRes.error && galRes.data) {
      const row = galRes.data as Record<string, unknown>;
      latestGalleryRow = {
        at: typeof row.created_at === 'string' ? row.created_at : null,
        ok: Boolean(String(row.url || row.image_url || '').trim()),
        detail: `featured=${String(row.featured)} published=${String(row.published)}`,
      };
    }
  }

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
      rewardLifecycle: rewardLifecycleReady,
    },
    deployment: {
      localLatestMigration: LATEST_LOCAL_MIGRATION,
      remoteLatestMigration: migrationParityReady ? LATEST_LOCAL_MIGRATION : notificationOperationsReady ? '000137_notification_operations_and_delivery.sql' : rewardLifecycleReady ? '000136_reward_lifecycle_and_twilio_delivery.sql' : 'Not verified',
      remoteMigrationSource: migrationParityReady ? 'Expected production schema and migration marker verified directly' : notificationOperationsReady ? 'Migration 000137 is verified; 000138 still needs deployment' : rewardLifecycleReady ? 'Migration 000136 is verified; 000137 and 000138 still need deployment' : 'Expected schema is incomplete',
      applicationVersion: process.env.npm_package_version ?? '0.1.0',
      applicationCommit,
      rewardLifecycleReady,
      migrationParityReady,
      expectedSchema: rewardSchemaChecks,
    },
    weatherMaps: {
      openWeatherConfigured: openWeatherConfigured(),
      businessHomeBaseConfigured: businessHomeBaseConfigured(),
      businessCoordinatesConfigured: Boolean(process.env.BUSINESS_LAT?.trim() && process.env.BUSINESS_LNG?.trim()),
      googleMapsKeyConfigured: googleMapsConfigured(),
      appleWeatherKit: {
        configured: Boolean(
          process.env.APPLE_TEAM_ID?.trim() &&
            process.env.APPLE_KEY_ID?.trim() &&
            process.env.APPLE_SERVICE_ID?.trim() &&
            process.env.APPLE_PRIVATE_KEY?.trim()
        ),
        status: 'future/advanced',
      },
      appleMapsServerApi: {
        configured: Boolean(process.env.APPLE_MAPS_KEY_ID?.trim() && process.env.APPLE_MAPS_PRIVATE_KEY?.trim()),
        status: 'future/advanced',
      },
      appleAdvanced,
    },
    envChecklist,
    authNotes: {
      passwordReset:
        'Password reset email is controlled in the Supabase dashboard under Authentication → email templates and SMTP (not in this Next app env).',
    },
    storage: {
      jobMediaBucket,
      jobMediaBucketExists,
      galleryBucket,
      galleryBucketExists,
      serviceRoleUploadReady: serviceRole && serviceRoleUploadOk,
      latestJobPhoto,
      latestGalleryRow,
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
