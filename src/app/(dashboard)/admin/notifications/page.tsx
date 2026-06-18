import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { NotificationCenterClient } from '@/components/admin/notification-center-client';
import { getResendEnvStatus, resendConfigured, twilioConfigured } from '@/lib/email-send';
import { normalizeNotificationTemplateRow } from '@/lib/notification-template-db';
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
  const emailRows = outboxRows.filter((row) => row.channel.toLowerCase().includes('email') || row.provider.toLowerCase().includes('resend'));
  const smsRows = outboxRows.filter((row) => row.channel.toLowerCase().includes('sms') || row.provider.toLowerCase().includes('twilio'));
  const failedRows = outboxRows.filter((row) => ['failed', 'error'].includes(row.status.toLowerCase()) || row.error_message);
  const pendingRows = outboxRows.filter((row) => ['pending', 'queued', 'new'].includes(row.status.toLowerCase()));
  const deliveredRows = outboxRows.filter((row) => ['sent', 'delivered', 'success', 'succeeded'].includes(row.status.toLowerCase()));
  const deliveryHealth = outboxRows.length > 0 ? Math.round((deliveredRows.length / outboxRows.length) * 100) : 100;

  return (
    <DashboardShell title='Notification center' subtitle='Templates, delivery log, test send, and provider status.' role='admin'>
      <section className='grid gap-4 md:grid-cols-3 xl:grid-cols-6'>
        {[
          ['Email Status', resendConfigured() ? 'Configured' : 'Setup needed', `${emailRows.length} recent email events`],
          ['SMS Status', twilioConfigured() ? 'Configured' : 'Setup needed', `${smsRows.length} recent SMS events`],
          ['Delivery Health', `${deliveryHealth}%`, `${deliveredRows.length}/${outboxRows.length || 0} delivered`],
          ['Failed Sends', String(failedRows.length), 'Open failures first'],
          ['Pending Sends', String(pendingRows.length), 'Queued or waiting'],
          ['Provider Status', resendConfigured() && twilioConfigured() ? 'Healthy' : 'Partial', 'Resend + Twilio'],
        ].map(([label, value, hint]) => (
          <div key={label} className='rounded-3xl border border-gold/15 bg-black/45 p-4 shadow-[0_0_24px_rgba(212,175,55,0.07)]'>
            <p className='text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500'>{label}</p>
            <p className='mt-3 text-xl font-black text-white'>{value}</p>
            <p className='mt-1 text-[10px] text-zinc-500'>{hint}</p>
          </div>
        ))}
      </section>
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
        resendEnv={getResendEnvStatus()}
        twilioOk={twilioConfigured()}
      />
    </DashboardShell>
  );
}
