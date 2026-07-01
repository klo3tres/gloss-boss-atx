import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { NotificationCenterClient } from '@/components/admin/notification-center-client';
import { TitanNotificationHub } from '@/components/admin/titan-notification-hub';
import { TitanPageShell } from '@/components/titan/titan-page-shell';
import { CollapsibleSection } from '@/components/ui/premium';
import { getResendEnvStatus, resendConfigured, twilioConfigured } from '@/lib/email-send';
import { normalizeNotificationTemplateRow } from '@/lib/notification-template-db';
import { loadTitanNotificationEvents, countUnreadNotifications } from '@/lib/titan/notification-events';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export default async function AdminNotificationsPage() {
  const admin = tryCreateAdminSupabase();
  const [{ data: templates }, { data: outbox }, hub] = await Promise.all([
    admin
      ? admin.from('notification_templates').select('*').order('template_key', { ascending: true }).limit(200)
      : Promise.resolve({ data: [] }),
    admin
      ? admin.from('notification_outbox').select('*').order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    admin ? loadTitanNotificationEvents(admin, { limit: 150 }) : Promise.resolve({ events: [], tablesReady: false }),
  ]);
  const unreadCount = admin ? await countUnreadNotifications(admin) : 0;

  const templateRows = (templates ?? []).map((r) => normalizeNotificationTemplateRow(r as Record<string, unknown>));

  const outboxRows = (outbox ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;
    return {
      id: str(row.id),
      kind: str(row.kind || row.template_key),
      channel: str(row.channel),
      status: str(row.status),
      created_at: str(row.created_at),
      subject: str(row.subject),
      error_message: str(row.error_message),
      skipped_reason: str(row.skipped_reason),
      provider: str(row.provider),
      provider_message_id: str(row.provider_message_id),
      payload,
    };
  });

  const failedRows = outboxRows.filter((row) => ['failed', 'error'].includes(row.status.toLowerCase()) || row.error_message);
  const deliveryHealth =
    outboxRows.length > 0
      ? Math.round(
          (outboxRows.filter((row) => ['sent', 'delivered', 'success', 'succeeded'].includes(row.status.toLowerCase())).length /
            outboxRows.length) *
            100,
        )
      : 100;

  return (
    <DashboardShell title="Activity" subtitle="Unified event feed for your business." role="admin" titanMode>
      <TitanPageShell
        title="Activity Center"
        sentence="What happened across bookings, payments, calendar, leads, and system events."
        kpi={unreadCount}
        kpiHint={`${unreadCount} unread · ${hub.events.length} recent events · ${deliveryHealth}% delivery health`}
        primaryAction={
          <Link
            href="/admin"
            className="rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black hover:brightness-110"
          >
            ← Executive briefing
          </Link>
        }
      >
        <TitanNotificationHub
          initialEvents={hub.events}
          tablesReady={hub.tablesReady}
          unreadCount={unreadCount}
          compactHeader
        />

        <CollapsibleSection title="Delivery & templates" subtitle="Admin tools — templates, outbox, provider status" defaultOpen={false}>
          <NotificationCenterClient
            templates={templateRows}
            outbox={outboxRows}
            resendOk={resendConfigured()}
            resendEnv={getResendEnvStatus()}
            twilioOk={twilioConfigured()}
          />
        </CollapsibleSection>

        {failedRows.length > 0 ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            {failedRows.length} failed delivery(s) in the recent outbox — expand Delivery & templates to investigate.
          </p>
        ) : null}
      </TitanPageShell>
    </DashboardShell>
  );
}
