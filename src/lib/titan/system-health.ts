import type { SupabaseClient } from '@supabase/supabase-js';

export type HealthStatus = 'ok' | 'missing' | 'manual' | 'error';

export type TitanHealthItem = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

export type TitanSystemHealth = {
  overall: 'healthy' | 'degraded' | 'critical';
  latestMigration: string;
  migrationReady: boolean;
  tables: TitanHealthItem[];
  integrations: TitanHealthItem[];
  leadCaptureReady: boolean;
};

const TABLE_CHECKS: { id: string; table: string; label: string }[] = [
  { id: 'titan_opportunities', table: 'titan_opportunities', label: 'Opportunity Scanner' },
  { id: 'titan_opportunity_hunts', table: 'titan_opportunity_hunts', label: 'Daily Hunt' },
  { id: 'titan_activity_events', table: 'titan_activity_events', label: 'Activity timeline' },
  { id: 'titan_workspace_settings', table: 'titan_workspace_settings', label: 'Business DNA' },
  { id: 'titan_prospects', table: 'titan_prospects', label: 'Lead Radar' },
  { id: 'leads', table: 'leads', label: 'Leads' },
  { id: 'customer_follow_ups', table: 'customer_follow_ups', label: 'Follow-ups' },
  { id: 'service_estimates', table: 'service_estimates', label: 'Estimates' },
  { id: 'appointments', table: 'appointments', label: 'Appointments' },
  { id: 'payments', table: 'payments', label: 'Payments' },
];

async function probeTable(admin: SupabaseClient, table: string): Promise<HealthStatus> {
  const { error } = await admin.from(table).select('id').limit(1);
  if (!error) return 'ok';
  const msg = error.message ?? '';
  if (/does not exist|schema cache|relation/i.test(msg)) return 'missing';
  return 'error';
}

function envOk(key: string) {
  return Boolean(process.env[key]?.trim());
}

export async function loadTitanSystemHealth(admin: SupabaseClient | null): Promise<TitanSystemHealth> {
  const latestMigration = '000093';
  const integrations: TitanHealthItem[] = [
    {
      id: 'supabase_url',
      label: 'Supabase URL',
      status: envOk('NEXT_PUBLIC_SUPABASE_URL') ? 'ok' : 'missing',
      detail: envOk('NEXT_PUBLIC_SUPABASE_URL') ? 'Configured' : 'NEXT_PUBLIC_SUPABASE_URL missing',
    },
    {
      id: 'supabase_anon',
      label: 'Supabase anon key',
      status: envOk('NEXT_PUBLIC_SUPABASE_ANON_KEY') ? 'ok' : 'missing',
      detail: envOk('NEXT_PUBLIC_SUPABASE_ANON_KEY') ? 'Configured' : 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing',
    },
    {
      id: 'service_role',
      label: 'Service role key',
      status: envOk('SUPABASE_SERVICE_ROLE_KEY') ? 'ok' : 'missing',
      detail: envOk('SUPABASE_SERVICE_ROLE_KEY')
        ? 'Configured — widget leads & Titan engines can write'
        : 'SUPABASE_SERVICE_ROLE_KEY missing — lead capture may fail',
    },
    {
      id: 'places',
      label: 'Google Places API',
      status: envOk('GOOGLE_PLACES_API_KEY') ? 'ok' : 'manual',
      detail: envOk('GOOGLE_PLACES_API_KEY') ? 'Connected' : 'Manual mode active — Lead Radar discovery disabled',
    },
    {
      id: 'stripe',
      label: 'Stripe',
      status: envOk('STRIPE_SECRET_KEY') || envOk('STRIPE_SECRET_KEY_LIVE') ? 'ok' : 'manual',
      detail: envOk('STRIPE_SECRET_KEY') || envOk('STRIPE_SECRET_KEY_LIVE') ? 'Connected' : 'Manual / not configured in env',
    },
    {
      id: 'twilio',
      label: 'Twilio SMS',
      status:
        envOk('TWILIO_ACCOUNT_SID') && envOk('TWILIO_AUTH_TOKEN') && envOk('TWILIO_PHONE_NUMBER') ? 'ok' : 'manual',
      detail:
        envOk('TWILIO_ACCOUNT_SID') && envOk('TWILIO_AUTH_TOKEN')
          ? 'Connected'
          : 'Manual mode — SMS outreach unavailable',
    },
    {
      id: 'weather',
      label: 'Weather API',
      status: envOk('OPENWEATHER_API_KEY') ? 'ok' : 'manual',
      detail: envOk('OPENWEATHER_API_KEY') ? 'Connected' : 'Manual mode — weather intelligence disabled',
    },
  ];

  if (!admin) {
    return {
      overall: 'critical',
      latestMigration,
      migrationReady: false,
      tables: TABLE_CHECKS.map((t) => ({
        id: t.id,
        label: t.label,
        status: 'error' as const,
        detail: 'Admin client unavailable',
      })),
      integrations,
      leadCaptureReady: false,
    };
  }

  const tableResults = await Promise.all(
    TABLE_CHECKS.map(async (t) => {
      const status = await probeTable(admin, t.table);
      return {
        id: t.id,
        label: t.label,
        status,
        detail:
          status === 'ok'
            ? 'Queryable'
            : status === 'missing'
              ? `Migration missing: ${t.table}`
              : `Error querying ${t.table}`,
      };
    }),
  );

  const oppReady = tableResults.find((t) => t.id === 'titan_opportunities')?.status === 'ok';
  const leadsReady = tableResults.find((t) => t.id === 'leads')?.status === 'ok';
  const migrationReady = oppReady && tableResults.find((t) => t.id === 'titan_activity_events')?.status === 'ok';
  const leadCaptureReady = leadsReady && envOk('SUPABASE_SERVICE_ROLE_KEY');

  const missingCount = tableResults.filter((t) => t.status === 'missing').length;
  const integrationIssues = integrations.filter((i) => i.status !== 'ok').length;
  const overall =
    missingCount > 3 || !envOk('SUPABASE_SERVICE_ROLE_KEY')
      ? 'critical'
      : missingCount > 0 || integrationIssues > 2
        ? 'degraded'
        : 'healthy';

  return {
    overall,
    latestMigration,
    migrationReady: Boolean(migrationReady),
    tables: tableResults,
    integrations,
    leadCaptureReady: Boolean(leadCaptureReady),
  };
}
