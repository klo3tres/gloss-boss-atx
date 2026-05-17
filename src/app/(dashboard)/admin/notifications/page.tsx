import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { saveNotificationTemplateAction } from './notification-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

const defaults = [
  ['job_started', 'Job Started', 'Gloss Boss ATX: Your {{service}} has started for {{vehicle}}.'],
  ['last_touches', 'Last Touches', 'Gloss Boss ATX: We are doing the last touches on {{vehicle}}.'],
  ['payment_link', 'Send Pay Now', 'Gloss Boss ATX: Your balance is ready. Pay here: {{payment_link}}'],
  ['review_request', 'Review Request', 'Gloss Boss ATX: Thanks for choosing us. Leave a review: {{review_link}}'],
  ['job_completed', 'Job Complete', 'Gloss Boss ATX: Your {{service}} is complete.'],
  ['technician_assigned', 'Technician Assigned', '{{tech}} has been assigned to your {{service}}.'],
  ['appointment_reminder', 'Appointment Reminder', 'Reminder: Gloss Boss ATX arrives at {{appointment_time}} for {{vehicle}}.'],
  ['appointment_confirmed', 'Appointment Confirmed', 'Your Gloss Boss ATX appointment is confirmed for {{appointment_time}}.'],
];

function str(v: unknown) {
  return v == null ? '' : String(v);
}

export default async function AdminNotificationsPage() {
  const admin = tryCreateAdminSupabase();
  const { data } = admin
    ? await admin.from('notification_templates').select('*').order('template_key', { ascending: true }).limit(200)
    : { data: [] };
  const rows = (data ?? []) as Row[];

  return (
    <DashboardShell title='Notification templates' subtitle='SMS, email, and push copy used by work orders, booking, receipts, reviews, and reminders.' role='admin'>
      <section className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-5 shadow-[0_0_45px_rgba(212,166,77,0.10)]'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Variables</p>
        <div className='mt-3 flex flex-wrap gap-2'>
          {['{{customer}}', '{{vehicle}}', '{{service}}', '{{tech}}', '{{address}}', '{{appointment_time}}', '{{payment_link}}', '{{review_link}}'].map((v) => (
            <span key={v} className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300'>{v}</span>
          ))}
        </div>
      </section>

      <section className='grid gap-4 lg:grid-cols-2'>
        <form action={saveNotificationTemplateAction} className='rounded-3xl border border-gold/20 bg-zinc-950/90 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Create / update template</p>
          <div className='mt-4 grid gap-3 sm:grid-cols-2'>
            <input name='key' placeholder='Template key, e.g. job_started' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            <select name='channel' defaultValue='sms' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
              <option value='sms'>SMS</option>
              <option value='email'>Email</option>
              <option value='push'>Push</option>
            </select>
            <input name='name' placeholder='Display name' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' />
            <input name='subject' placeholder='Email subject (optional)' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' />
            <textarea name='body' rows={6} placeholder='Template body with {{variables}}' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' />
          </div>
          <label className='mt-3 flex items-center gap-2 text-xs text-zinc-300'><input name='enabled' type='checkbox' defaultChecked /> Enabled</label>
          <button className='mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>Save Template</button>
        </form>

        <div className='rounded-3xl border border-white/10 bg-zinc-950/90 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Recommended defaults</p>
          <div className='mt-4 space-y-2'>
            {defaults.map(([key, name, body]) => (
              <form key={key} action={saveNotificationTemplateAction} className='rounded-xl border border-white/10 bg-black/35 p-3'>
                <input type='hidden' name='key' value={key} />
                <input type='hidden' name='channel' value='sms' />
                <input type='hidden' name='name' value={name} />
                <input type='hidden' name='body' value={body} />
                <input type='hidden' name='enabled' value='on' />
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <p className='text-sm font-bold text-white'>{name}</p>
                    <p className='text-xs text-zinc-500'>{body}</p>
                  </div>
                  <button className='rounded-lg border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft'>Install</button>
                </div>
              </form>
            ))}
          </div>
        </div>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950/90 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Saved templates</p>
        <div className='mt-4 grid gap-3 lg:grid-cols-2'>
          {rows.length === 0 ? <p className='text-sm text-zinc-500'>No templates yet. Install the defaults above.</p> : null}
          {rows.map((r) => (
            <article key={str(r.id)} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
              <div className='flex items-center justify-between gap-3'>
                <p className='font-bold text-white'>{str(r.name) || str(r.template_key)}</p>
                <span className='rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-zinc-400'>{str(r.channel)}</span>
              </div>
              {r.subject ? <p className='mt-2 text-xs text-gold-soft'>{str(r.subject)}</p> : null}
              <p className='mt-2 whitespace-pre-wrap text-xs text-zinc-400'>{str(r.body)}</p>
              <p className='mt-2 text-[10px] uppercase tracking-wider text-zinc-600'>{str(r.enabled) === 'false' ? 'disabled' : 'enabled'}</p>
            </article>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
