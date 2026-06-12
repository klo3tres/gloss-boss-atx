'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  installAllNotificationDefaultsAction,
  saveNotificationTemplateAction,
  testNotificationSendAction,
} from '@/app/(dashboard)/admin/notifications/notification-actions';
import { 
  Mail, 
  MessageSquare, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  FileText, 
  Database,
  ArrowRight,
  Sparkles,
  Layers,
  Settings
} from 'lucide-react';

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
  subject?: string;
  payload?: Record<string, unknown> | null;
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

type ResendEnv = {
  apiKeySet: boolean;
  fromEmailSet: boolean;
  fromEmail: string;
  ready: boolean;
  missing: string[];
};

export function NotificationCenterClient({
  templates,
  outbox,
  resendOk,
  resendEnv,
  twilioOk,
}: {
  templates: TemplateRow[];
  outbox: OutboxRow[];
  resendOk: boolean;
  resendEnv: ResendEnv;
  twilioOk: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Templates');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

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
          <p className='lg:col-span-2 text-sm text-zinc-400'>
            App notification templates for booking confirmations, reminders, receipts, and internal alerts. Customer emails also use branded layouts in code.
          </p>
          <form action={saveNotificationTemplateAction} className='gb-glass rounded-3xl border border-gold/20 p-5'>
            <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Create / update template</p>
            <p className='mt-1 text-xs text-zinc-500'>Saved templates: {templates.length}</p>
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
            <button
              type='button'
              disabled={installing}
              onClick={() => {
                setInstalling(true);
                void installAllNotificationDefaultsAction().then((r) => {
                  setInstallMsg(r.message);
                  setInstalling(false);
                  if (r.ok) router.refresh();
                });
              }}
              className='mt-3 w-full rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-xs font-black uppercase text-gold-soft disabled:opacity-50'
            >
              {installing ? 'Installing…' : 'Install all defaults'}
            </button>
            {installMsg ? <p className='mt-2 text-xs text-emerald-200'>{installMsg}</p> : null}
            <div className='mt-3 max-h-[320px] space-y-2 overflow-y-auto'>
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
        <StructuredOutboxLogs rows={sent} empty='No sent messages logged yet.' />
      ) : null}

      {tab === 'Failed / skipped' ? (
        <StructuredOutboxLogs rows={failed} empty='No failed or skipped messages.' />
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
          <div
            className={`mt-3 rounded-xl border px-3 py-2 text-xs ${resendEnv.ready ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-amber-500/30 bg-amber-500/10 text-amber-100'}`}
          >
            <p className='font-bold'>Resend (email test)</p>
            <p className='mt-1'>
              RESEND_API_KEY: {resendEnv.apiKeySet ? 'set' : 'missing'} · RESEND_FROM_EMAIL:{' '}
              {resendEnv.fromEmailSet ? resendEnv.fromEmail : 'missing'}
            </p>
            {!resendEnv.ready ? (
              <p className='mt-1'>
                Email tests will be skipped until both are in <code className='text-amber-200'>.env.local</code> and the server is restarted.
              </p>
            ) : null}
          </div>
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
              {resendOk ? 'Configured' : 'Not configured — emails log as skipped/failed'}
            </p>
            <dl className='mt-3 space-y-1 text-xs text-zinc-400'>
              <div>RESEND_API_KEY: {resendEnv.apiKeySet ? 'set' : 'missing'}</div>
              <div>RESEND_FROM_EMAIL: {resendEnv.fromEmailSet ? resendEnv.fromEmail : 'missing'}</div>
            </dl>
            <p className='mt-3 text-xs text-zinc-500'>Test sends must return provider id in outbox before showing success. Webhook delivery may show accepted → delivered later.</p>
            <a href='/admin/integrations' className='mt-3 inline-block text-xs font-bold uppercase text-gold-soft underline'>
              Full Resend debug →
            </a>
          </div>
          <div className='gb-glass rounded-2xl border border-gold/20 p-5'>
            <p className='text-sm font-bold text-white'>Twilio (SMS)</p>
            <p className={`mt-2 text-lg font-black ${twilioOk ? 'text-emerald-300' : 'text-amber-200'}`}>
              {twilioOk ? 'Credentials set' : 'Not configured'}
            </p>
            <p className='mt-2 text-xs text-amber-200/90'>
              Toll-free verification may be pending. Error <span className='font-mono'>30032</span> means use email/manual SMS fallback until verified.
            </p>
            <p className='mt-2 text-xs text-zinc-500'>All SMS actions should show skipped/failed with reason when not deliverable.</p>
            <a href='/admin/integrations' className='mt-3 inline-block text-xs font-bold uppercase text-gold-soft underline'>
              Twilio status & test →
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StructuredOutboxLogs({ rows, empty }: { rows: OutboxRow[]; empty: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | 'email' | 'sms'>('all');

  const filtered = rows.filter((r) => {
    const searchLower = search.toLowerCase();
    const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const to = String((p as { to?: unknown }).to ?? '').toLowerCase();
    const subject = String(r.subject ?? '').toLowerCase();
    const kind = String(r.kind ?? '').toLowerCase();
    
    const matchesSearch = 
      to.includes(searchLower) ||
      subject.includes(searchLower) ||
      kind.includes(searchLower) ||
      r.id.toLowerCase().includes(searchLower);

    const matchesChannel = channelFilter === 'all' || r.channel.toLowerCase() === channelFilter;

    return matchesSearch && matchesChannel;
  });

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'sent' || s === 'delivered') {
      return <span className="rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-300 font-mono">Sent</span>;
    }
    if (s === 'failed') {
      return <span className="rounded-full bg-rose-500/10 border border-rose-500/25 px-2.5 py-0.5 text-[9px] font-black uppercase text-rose-300 font-mono">Failed</span>;
    }
    return <span className="rounded-full bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 text-[9px] font-black uppercase text-amber-300 font-mono">{status}</span>;
  };

  const getChannelIcon = (channel: string) => {
    const c = channel.toLowerCase();
    if (c === 'email') return <Mail className="h-3.5 w-3.5 text-cyan-400" />;
    if (c === 'sms') return <MessageSquare className="h-3.5 w-3.5 text-gold-soft" />;
    return <FileText className="h-3.5 w-3.5 text-zinc-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950/60 border border-white/5 p-4 rounded-2xl">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search outbox (e.g. user@example.com)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-black border border-white/10 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-gold/40 transition"
          />
        </div>
        <div className="flex gap-2">
          {([
            { id: 'all', label: 'All Channels' },
            { id: 'email', label: 'Email' },
            { id: 'sms', label: 'SMS' },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setChannelFilter(opt.id)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition ${
                channelFilter === opt.id
                  ? 'bg-gold/15 border border-gold/30 text-gold-soft'
                  : 'border border-white/5 text-zinc-400 hover:border-white/15'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
        {filtered.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center">
            <Database className="h-6 w-6 text-zinc-800 mb-1" />
            <p className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">{empty}</p>
          </div>
        ) : (
          filtered.map((r) => {
            const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
            const to = String((p as { to?: unknown }).to ?? '—');
            const from = String((p as { from?: unknown }).from ?? '—');
            const isExpanded = expandedId === r.id;

            return (
              <div
                key={r.id}
                className={`rounded-2xl border transition duration-200 bg-zinc-950/40 ${
                  isExpanded ? 'border-gold/30 shadow-[0_0_24px_rgba(212,175,55,0.02)]' : 'border-white/5 hover:border-white/10'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 p-1.5 bg-black/40 border border-white/5 rounded-lg shrink-0">
                      {getChannelIcon(r.channel)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{r.kind}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">ID: {r.id.slice(0, 8)}...</span>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-300 truncate font-mono">
                        to: {to}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : 'No date'}
                    </span>
                    {getStatusBadge(r.status)}
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-white/5 bg-black/25 rounded-b-2xl space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 text-xs">
                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Log Properties</p>
                        <dl className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-[11px] text-zinc-300">
                          <dt className="text-zinc-500">Sender (From):</dt>
                          <dd className="font-mono truncate">{from}</dd>
                          <dt className="text-zinc-500">Recipient (To):</dt>
                          <dd className="font-mono truncate">{to}</dd>
                          <dt className="text-zinc-500">Channel:</dt>
                          <dd className="uppercase font-semibold text-zinc-400">{r.channel}</dd>
                          <dt className="text-zinc-500">Provider:</dt>
                          <dd className="font-mono">{r.provider || '—'}</dd>
                          <dt className="text-zinc-500">Provider ID:</dt>
                          <dd className="font-mono truncate">{r.provider_message_id || '—'}</dd>
                        </dl>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Delivery Details</p>
                        <dl className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-[11px] text-zinc-300">
                          <dt className="text-zinc-500">Status:</dt>
                          <dd className="font-mono font-bold text-white">{r.status}</dd>
                          <dt className="text-zinc-500">Error Message:</dt>
                          <dd className="text-rose-400">{r.error_message || '—'}</dd>
                          <dt className="text-zinc-500">Skipped Reason:</dt>
                          <dd className="text-amber-400">{r.skipped_reason || '—'}</dd>
                        </dl>
                      </div>
                    </div>

                    {r.subject && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Subject</p>
                        <p className="text-xs font-semibold text-white bg-black/40 border border-white/5 p-2 rounded-lg">{r.subject}</p>
                      </div>
                    )}

                    {r.payload && Object.keys(p).length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Raw Payload JSON</p>
                        <pre className="text-[10px] text-zinc-400 font-mono bg-black/60 border border-white/5 p-3 rounded-lg overflow-x-auto max-h-[180px]">
                          {JSON.stringify(p, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
