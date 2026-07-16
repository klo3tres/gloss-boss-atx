'use client';

import { useCallback, useState, useTransition } from 'react';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import {
  searchBulkRecipientsAction,
  sendBulkOutboundAction,
  sendBulkTestToOwnerAction,
  type BulkRecipient,
} from '@/app/(dashboard)/admin/bulk-outbound-actions';

export function BulkOutboundPanel() {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<'all' | 'customers' | 'opportunities'>('all');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('Gloss Boss ATX');
  const [recipients, setRecipients] = useState<BulkRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { openPreview } = useOutboundPreview();

  const runSearch = useCallback(() => {
    startTransition(async () => {
      const res = await searchBulkRecipientsAction({ query, source });
      setRecipients(res.recipients);
      setSelected(new Set());
      if (res.error) setStatus(res.error);
    });
  }, [query, source]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedList = recipients.filter((r) => selected.has(r.id));
  const first = selectedList[0];
  const eligibleRecipients = recipients.filter((r) => channel === 'sms' ? Boolean(r.canSms && r.phone) : Boolean(r.canEmail && r.email));
  const blockedCount = recipients.length - eligibleRecipients.length;

  const previewBulk = () => {
    if (!first || !body.trim()) return;
    const to = channel === 'sms' ? first.phone : first.email;
    if (!to) return;
    openPreview({
      title: `Bulk send (${selectedList.length} recipient${selectedList.length === 1 ? '' : 's'})`,
      channel,
      recipient: to,
      body,
      subject: channel === 'email' ? subject : undefined,
      contextLabel: first.label,
      kind: 'bulk_outbound',
      sendLabel: `Send to ${selectedList.length}`,
      onSend: async (final) => {
        const res = await sendBulkOutboundAction({
          recipientIds: [...selected],
          channel: final.channel,
          body: final.body,
          subject: final.subject ?? subject,
        });
        setStatus(`Sent ${res.sent}, skipped ${res.skipped}${res.errors.length ? ` — ${res.errors[0]}` : ''}`);
        return res.ok ? { ok: true } : { error: res.errors[0] ?? 'Bulk send failed' };
      },
      onSchedule: async (final) => {
        const res = await sendBulkOutboundAction({
          recipientIds: [...selected],
          channel: final.channel,
          body: final.body,
          subject: final.subject ?? subject,
          scheduledFor: final.scheduledFor,
        });
        setStatus(`Scheduled ${res.sent}, skipped ${res.skipped}`);
        return res.ok ? { ok: true } : { error: res.errors[0] ?? 'Schedule failed' };
      },
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Bulk outbound</p>
      <p className="mt-1 text-xs text-zinc-400">Select customers or leads, preview once, then send or schedule to all with consent checks.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(['all', 'customers', 'opportunities'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSource(s)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
              source === s ? 'bg-gold text-black' : 'border border-white/10 text-zinc-400'
            }`}
          >
            {s}
          </button>
        ))}
        {(['sms', 'email'] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
              channel === c ? 'bg-white/10 text-white' : 'border border-white/10 text-zinc-500'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone…"
          className="min-w-[200px] flex-1 rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          disabled={pending}
          onClick={runSearch}
          className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300"
        >
          Search
        </button>
      </div>

      {recipients.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
            <span>{eligibleRecipients.length} eligible · {blockedCount} blocked · {selected.size} selected</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelected(new Set(eligibleRecipients.map((r) => r.id)))} className="font-black uppercase text-gold-soft">Select eligible</button>
              <button type="button" onClick={() => setSelected(new Set())} className="font-black uppercase text-zinc-500">Clear</button>
            </div>
          </div>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-white/8 bg-black/40 p-2">
          {recipients.map((r) => {
            const deliverable = channel === 'sms' ? r.canSms && r.phone : r.canEmail && r.email;
            return (
              <li key={r.id}>
                <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${deliverable ? 'text-zinc-200' : 'text-zinc-600'}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={!deliverable}
                    onChange={() => toggle(r.id)}
                    className="mt-0.5 accent-[var(--gold)]"
                  />
                  <span>
                    <span className="font-semibold">{r.label}</span>
                    <span className="block text-[10px] text-zinc-500">
                      {r.phone ?? '—'} · {r.email ?? '—'}
                      {channel === 'sms' && r.smsBlocker ? ` · ${r.smsBlocker}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        </div>
      ) : null}

      {channel === 'email' ? (
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          className="mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
        />
      ) : null}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="Message body…"
        className="mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 font-mono text-xs text-zinc-200"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={() => startTransition(async () => {
            const result = await sendBulkTestToOwnerAction({ channel, body, subject });
            setStatus(result.error ?? `Test sent to ${result.destination ?? 'owner'}. Confirm delivery before sending the campaign.`);
          })}
          className="rounded-xl border border-cyan-500/30 px-4 py-2.5 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50"
        >
          Test send to owner
        </button>
        <button
          type="button"
          disabled={pending || selected.size === 0 || !body.trim()}
          onClick={previewBulk}
          className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          Preview & send ({selected.size})
        </button>
      </div>

      {status ? <p className="mt-3 text-xs text-zinc-400">{status}</p> : null}
    </div>
  );
}
