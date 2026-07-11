import type { SupabaseClient } from '@supabase/supabase-js';
import { CRON_SCHEDULES, HOBBY_MODE_AUTOMATION_WARNING } from '@/lib/cron-schedules';
import { titanConfigSummary } from '@/lib/titan/config';

export type HealthStatus = 'ok' | 'missing' | 'manual' | 'error';

export type TitanHealthItem = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

export type TitanCronSchedule = {
  id: string;
  label: string;
  path: string;
  schedule: string;
  manualHint: string;
};

export type TitanSystemHealth = {
  overall: 'healthy' | 'degraded' | 'critical';
  latestMigration: string;
  migrationReady: boolean;
  tables: TitanHealthItem[];
  integrations: TitanHealthItem[];
  leadCaptureReady: boolean;
  hobbyMode: boolean;
  hobbyModeWarning: string;
  cronSchedules: TitanCronSchedule[];
  automationRuns: Array<{ jobKey: string; status: string; startedAt: string; durationMs: number | null; error: string | null }>;
};

const TABLE_CHECKS: { id: string; table: string; label: string }[] = [
  { id: 'titan_opportunities', table: 'titan_opportunities', label: 'Opportunity Scanner' },
  { id: 'titan_experiments', table: 'titan_experiments', label: 'Experiment Engine' },
  { id: 'titan_mission_actions', table: 'titan_mission_actions', label: 'Daily Manager' },
  { id: 'titan_deals', table: 'titan_deals', label: 'Deal Room' },
  { id: 'titan_kpi_events', table: 'titan_kpi_events', label: 'KPI events' },
  { id: 'titan_attributions', table: 'titan_attributions', label: 'Attribution' },
  { id: 'titan_touch_schedule', table: 'titan_touch_schedule', label: 'Follow-up cadence' },
  { id: 'titan_offers', table: 'titan_offers', label: 'Offer builder' },
  { id: 'titan_job_closeouts', table: 'titan_job_closeouts', label: 'Job closeouts' },
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

const CRON_SCHEDULE_ITEMS: TitanCronSchedule[] = [
  {
    id: 'titan_nightly',
    label: 'Titan nightly engine',
    path: '/api/cron/titan-nightly',
    schedule: CRON_SCHEDULES.titanNightly,
    manualHint: 'Command Center → Run Titan nightly',
  },
  {
    id: 'sync_exceptions',
    label: 'Exception inbox sync',
    path: '/api/cron/sync-exceptions',
    schedule: CRON_SCHEDULES.syncExceptions,
    manualHint: 'Exception inbox → Sync now',
  },
  {
    id: 'process_follow_ups',
    label: 'Follow-up engine',
    path: '/api/cron/process-follow-ups',
    schedule: CRON_SCHEDULES.processFollowUps,
    manualHint: 'Follow-ups → Run engine now',
  },
];

export async function loadTitanSystemHealth(admin: SupabaseClient | null): Promise<TitanSystemHealth> {
  const latestMigration = '000127';
  const hobbyMode = true;
  const hobbyModeWarning = HOBBY_MODE_AUTOMATION_WARNING;
  const cfg = titanConfigSummary();
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
      status: cfg.places ? 'manual' : 'missing',
      detail: cfg.places ? 'Configured — the latest Hunt result verifies permissions and quota' : 'Discovery disabled until Google Places API is connected',
    },
    {
      id: 'google_maps',
      label: 'Google Maps (render)',
      status: cfg.maps ? 'manual' : 'missing',
      detail: cfg.maps ? 'Configured — map rendering is available' : 'Map view disabled — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    },
    {
      id: 'stripe',
      label: 'Stripe',
      status: cfg.stripe ? 'manual' : 'missing',
      detail: cfg.stripe ? `Configured${cfg.stripeWebhook ? ' with webhook secret' : ' — webhook secret missing'}` : 'Not configured',
    },
    {
      id: 'twilio',
      label: 'Twilio SMS',
      status:
        cfg.twilio ? 'manual' : 'missing',
      detail: cfg.twilio ? 'Configured — TWILIO_FROM_NUMBER, legacy phone alias, and Messaging Service are supported' : 'SMS outreach unavailable',
    },
    {
      id: 'weather',
      label: 'Weather API',
      status: cfg.weather ? 'manual' : 'missing',
      detail: cfg.weather ? 'Configured — OPENWEATHER_API_KEY and legacy OPENWEATHER_API_KE are supported' : 'Weather intelligence disabled',
    },
    { id: 'cron_secret', label: 'Cron authorization', status: cfg.cron ? 'ok' : 'missing', detail: cfg.cron ? 'CRON_SECRET configured' : 'CRON_SECRET missing; scheduled routes return 401' },
    { id: 'resend', label: 'Resend email', status: cfg.resend ? 'manual' : 'missing', detail: cfg.resend ? 'Configured; provider results are recorded per send' : 'Email sends unavailable' },
    { id: 'calendar', label: 'Google Calendar', status: cfg.googleCalendar ? 'manual' : 'missing', detail: cfg.googleCalendar ? 'OAuth configured; connection verified at runtime' : 'OAuth client configuration missing' },
    { id: 'app_url', label: 'Public app URL', status: cfg.appUrl ? 'ok' : 'missing', detail: cfg.appUrl ? 'Configured' : 'NEXT_PUBLIC_APP_URL missing' },
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
      hobbyMode,
      hobbyModeWarning,
      cronSchedules: CRON_SCHEDULE_ITEMS,
      automationRuns: [],
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

  const { data: recentRuns } = await admin.from('titan_automation_runs').select('job_key, status, started_at, duration_ms, error_message').order('started_at', { ascending: false }).limit(12);
  const latestByJob = new Map<string, Record<string, unknown>>();
  for (const raw of recentRuns ?? []) {
    const row = raw as Record<string, unknown>;
    const key = String(row.job_key ?? '');
    if (key && !latestByJob.has(key)) latestByJob.set(key, row);
  }
  const automationRuns = [...latestByJob.values()].map((row) => ({
    jobKey: String(row.job_key ?? ''), status: String(row.status ?? ''), startedAt: String(row.started_at ?? ''),
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
    error: row.error_message ? String(row.error_message) : null,
  }));

  const oppReady = tableResults.find((t) => t.id === 'titan_opportunities')?.status === 'ok';
  const leadsReady = tableResults.find((t) => t.id === 'leads')?.status === 'ok';
  const migrationReady = oppReady && tableResults.find((t) => t.id === 'titan_activity_events')?.status === 'ok';
  const leadCaptureReady = leadsReady && cfg.serviceRole;

  const missingCount = tableResults.filter((t) => t.status === 'missing').length;
  const integrationIssues = integrations.filter((i) => i.status !== 'ok').length;
  const overall =
    missingCount > 3 || !cfg.serviceRole || !cfg.cron
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
    hobbyMode,
    hobbyModeWarning,
    cronSchedules: CRON_SCHEDULE_ITEMS,
    automationRuns,
  };
}
