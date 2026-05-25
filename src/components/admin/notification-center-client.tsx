'use client';

import { useState } from 'react';
import { saveNotificationTemplateAction, testNotificationSendAction } from '@/app/(dashboard)/admin/notifications/notification-actions';

type TemplateRow = {
  id: string;
  template_key: string;
  channel: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
};

type OutboxRow = {
  id: string;
  kind: string;
  channel: string;
  status: string;
  created_at: string;
  error_message: string;
  skipped_reason: string;
  provider: string;
  provider_message_id: string;
};

const TABS = ['Templates', 'Sent log', 'Failed / skipped', 'Test send', 'Provider status'] as const;

const DEFAULTS: Array<[string, string, string, string]> = [
  ['booking_confirmation', 'email', 'Booking Confirmation', 'Gloss Boss ATX: Your appointment is confirmed for {{appointment_time}}.'],
  ['booking_reminder', 'sms', 'Booking Reminder', 'Reminder: Gloss Boss ATX at {{appointment_time}} for {{vehicle}}.'],
  ['admin_new_booking', 'sms', 'Admin New Booking', 'New booking {{customer}} {{appointment_time}} Total {{payment_link}}'],
  ['job_started', 'sms', 'Job Started', 'Gloss Boss ATX: Your {{service}} has started for {{vehicle}}.'],
  ['technician_en_route', 'sms', 'Technician En Route', 'Gloss Boss ATX: Your technician is on the way for {{appointment_time}}.'],
  ['pay_balance', 'sms', 'Pay Balance', 'Balance due: {{payment_link}}'],
  ['invoice_receipt', 'email', 'Invoice / Receipt', 'Receipt for {{service}} — {{payment_link}}'],
  ['review_request', 'sms', 'Review Request', 'Thanks! Leave a review: {{review_link}}'],
  ['account_claim', 'email', 'Account Claim', 'Claim your booking: {{payment_link}}'],
  ['reschedule_cancel', 'sms', 'Reschedule / Cancel', 'Gloss Boss ATX: Appointment update for {{appointment_time}}.'],
];

export function NotificationCenterClient({
  templates,
  outbox,
  resendOk,
  twilioOk,
}: {
  templates: TemplateRow[];
  outbox: OutboxRow[];
  resendOk: boolean;
  twilioOk: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Templates');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const failed = outbox.filter((r) => r.status === 'failed' || r.status === 'skipped');
  const sent = outbox.filter((r) => r.status === 'sent' || r.status === 'delivered');

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap gap-2'>
        {TABS.map((t) => (
          <button
            key={t}
            type='button'
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'rounded-full border border-gold bg-gold/15 px-4 py-2 text-xs font-black uppercase text-gold-soft'
                : 'rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase text-zinc-500 hover:border-gold/30'
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Templates' ? (
        <div className='grid gap-6 lg:grid-cols-2'>
          <form action={saveNotificationTemplateAction} className='gb-glass rounded-3xl border border-gold/20 p-5'>
            <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Create / update template</p>
            <div className='mt-4 grid gap-3'>
              <input name='key' placeholder='Template key' className='gb-input' required />
              <select name='channel' defaultValue='email' className='gb-input'>
                <option value='email'>Email</option>
                <option value='sms'>SMS</option>
                <option value='push'>Push</option>
              </select>
              <input name='name' placeholder='Display name' className='gb-input' required />
              <input name='subject' placeholder='Email subject' className='gb-input' />
              <textarea name='body' rows={5} placeholder='Body with {{variables}}' className='gb-input' required />
            </div>
            <label className='mt-3 flex items-center gap-2 text-xs text-zinc-300'>
              <input name='enabled' type='checkbox' defaultChecked /> Active
            </label>
            <button type='submit' className='mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>
              Save template
            </button>
          </form>

          <div className='gb-glass rounded-3xl border border-white/10 p-5'>
            <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Install defaults</p>
            <div className='mt-3 max-h-[420px] space-y-2 overflow-y-auto'>
              {DEFAULTS.map(([key, channel, name, body]) => (
                <form key={key} action={saveNotificationTemplateAction} className='rounded-xl border border-white/10 bg-black/40 p-3'>
                  <input type='hidden' name='key' value={key} />
                  <input type='hidden' name='channel' value={channel} />
                  <input type='hidden' name='name' value={name} />
                  <input type='hidden' name='body' value={body} />
                  <input type='hidden' name='enabled' value='on' />
                  <div className='flex items-center justify-between gap-2'>
                    <div>
                      <p className='text-sm font-bold text-white'>{name}</p>
                      <p className='text-[10px] uppercase text-zinc-500'>{key} · {channel}</p>
                    </div>
                    <button type='submit' className='text-[10px] font-black uppercase text-gold-soft'>
                      Install
                    </button>
                  </div>
                </form>
              ))}
            </div>
          </div>

          <div className='lg:col-span-2'>
            <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Saved templates ({templates.length})</p>
            <div className='mt-3 grid gap-3 md:grid-cols-2'>
              {templates.map((r) => (
                <article key={r.id} className='gb-glass rounded-2xl border border-white/10 p-4'>
                  <div className='flex justify-between gap-2'>
                    <p className='font-bold text-white'>{r.name}</p>
                    <span className='text-[10px] uppercase text-zinc-500'>{r.channel}</span>
                  </div>
                  <p className='text-[10px] text-zinc-600'>{r.template_key}</p>
                  {r.subject ? <p className='mt-2 text-xs text-gold-soft'>{r.subject}</p> : null}
                  <p className='mt-2 line-clamp-3 text-xs text-zinc-400'>{r.body}</p>
                  <p className='mt-2 text-[10px] uppercase'>{r.enabled ? 'Active' : 'Inactive'}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'Sent log' ? (
        <OutboxTable rows={sent} empty='No sent messages logged yet.' />
      ) : null}

      {tab === 'Failed / skipped' ? (
        <OutboxTable rows={failed} empty='No failed or skipped messages.' />
      ) : null}

      {tab === 'Test send' ? (
        <form
          action={async (fd) => {
            const r = await testNotificationSendAction(fd);
            setTestMsg(r.message);
          }}
          className='gb-glass max-w-lg rounded-3xl border border-gold/20 p-5'
        >
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Test send</p>
          <div className='mt-4 grid gap-3'>
            <select name='channel' defaultValue='email' className='gb-input'>
              <option value='email'>Email</option>
              <option value='sms'>SMS</option>
            </select>
            <input name='to' placeholder='Email or phone' className='gb-input' required />
            <input name='subject' placeholder='Subject (email)' className='gb-input' />
            <textarea name='body' rows={4} defaultValue='Gloss Boss ATX test message.' className='gb-input' required />
          </div>
          <button type='submit' className='mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>
            Send test
          </button>
          {testMsg ? <p className='mt-3 text-sm text-zinc-300'>{testMsg}</p> : null}
        </form>
      ) : null}

      {tab === 'Provider status' ? (
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='gb-glass rounded-2xl border border-gold/20 p-5'>
            <p className='text-sm font-bold text-white'>Resend (email)</p>
            <p className={`mt-2 text-lg font-black ${resendOk ? 'text-emerald-300' : 'text-amber-200'}`}>
              {resendOk ? 'Configured' : 'Not configured'}
            </p>
            <p className='mt-2 text-xs text-zinc-500'>RESEND_API_KEY · RESEND_FROM_EMAIL</p>
          </div>
          <div className='gb-glass rounded-2xl border border-gold/20 p-5'>
            <p className='text-sm font-bold text-white'>Twilio (SMS)</p>
            <p className={`mt-2 text-lg font-black ${twilioOk ? 'text-emerald-300' : 'text-amber-200'}`}>
              {twilioOk ? 'Configured' : 'Not configured'}
            </p>
            <p className='mt-2 text-xs text-zinc-500'>TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_FROM</p>
            <p className='mt-2 text-xs text-zinc-500'>BUSINESS_NOTIFY_PHONE for owner booking alerts</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutboxTable({ rows, empty }: { rows: OutboxRow[]; empty: string }) {
  return (
    <div className='gb-admin-table-wrap gb-glass'>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Kind</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Provider</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className='py-6 text-zinc-500'>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td className='tabular-nums text-zinc-400'>{r.created_at.slice(0, 19)}</td>
                <td className='font-semibold text-white'>{r.kind}</td>
                <td>{r.channel}</td>
                <td className={r.status === 'sent' ? 'text-emerald-300' : r.status === 'failed' ? 'text-red-300' : 'text-amber-200'}>
                  {r.status}
                </td>
                <td className='text-zinc-500'>{r.provider}</td>
                <td className='max-w-xs truncate text-zinc-500'>{r.error_message || r.skipped_reason || r.provider_message_id}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
