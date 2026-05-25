import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { NotificationCenterClient } from '@/components/admin/notification-center-client';
import { resendConfigured, twilioConfigured } from '@/lib/email-send';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v);
}

export default async function AdminNotificationsPage() {
  const admin = tryCreateAdminSupabase();
  const [{ data: templates }, { data: outbox }] = await Promise.all([
    admin
      ? admin.from('notification_templates').select('*').order('template_key', { ascending: true }).limit(200)
      : Promise.resolve({ data: [] }),
    admin
      ? admin.from('notification_outbox').select('*').order('created_at', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  const templateRows = (templates ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: str(row.id),
      template_key: str(row.template_key),
      channel: str(row.channel),
      name: str(row.name),
      subject: str(row.subject),
      body: str(row.body),
      enabled: row.enabled !== false,
    };
  });

  const outboxRows = (outbox ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: str(row.id),
      kind: str(row.kind || row.template_key),
      channel: str(row.channel),
      status: str(row.status),
      created_at: str(row.created_at),
      error_message: str(row.error_message),
      skipped_reason: str(row.skipped_reason),
      provider: str(row.provider),
      provider_message_id: str(row.provider_message_id),
    };
  });

  return (
    <DashboardShell title='Notification center' subtitle='Templates, delivery log, test send, and provider status.' role='admin'>
      <section className='gb-glass rounded-3xl border border-gold/25 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Variables</p>
        <div className='mt-3 flex flex-wrap gap-2'>
          {['{{customer}}', '{{vehicle}}', '{{service}}', '{{tech}}', '{{address}}', '{{appointment_time}}', '{{payment_link}}', '{{review_link}}'].map(
            (v) => (
              <span key={v} className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300'>
                {v}
              </span>
            ),
          )}
        </div>
      </section>

      <NotificationCenterClient
        templates={templateRows}
        outbox={outboxRows}
        resendOk={resendConfigured()}
        twilioOk={twilioConfigured()}
      />
    </DashboardShell>
  );
}
