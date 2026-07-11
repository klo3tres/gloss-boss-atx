'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MessageTone } from '@/lib/outbound-message-tones';
import { MESSAGE_TONE_LABELS } from '@/lib/outbound-message-tones';
import { displayMoney } from '@/lib/display-format';

function defaultScheduleLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function MessagePreviewModal({
  open,
  title,
  channel,
  channelOptions,
  recipient,
  body,
  subject,
  contextLabel,
  toneVariants,
  priceCents,
  durationMinutes,
  busy,
  allowSchedule = true,
  sendLabel = 'Send',
  onCancel,
  onSend,
  onSchedule,
  onCopy,
}: {
  open: boolean;
  title: string;
  channel: 'sms' | 'email';
  channelOptions?: Array<'sms' | 'email'>;
  recipient: string;
  body: string;
  subject?: string;
  contextLabel?: string;
  toneVariants?: Partial<Record<MessageTone, string>>;
  priceCents?: number;
  durationMinutes?: number;
  busy?: boolean;
  allowSchedule?: boolean;
  sendLabel?: string;
  onCancel: () => void;
  onSend: (final: { body: string; subject?: string; channel: 'sms' | 'email'; tone: MessageTone }) => void;
  onSchedule?: (final: { body: string; subject?: string; channel: 'sms' | 'email'; scheduledFor: string; tone: MessageTone }) => void;
  onCopy?: (text: string) => void;
}) {
  const [editBody, setEditBody] = useState(body);
  const [editSubject, setEditSubject] = useState(subject ?? '');
  const [tone, setTone] = useState<MessageTone>('professional');
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleLocal);
  const [activeChannel, setActiveChannel] = useState(channel);

  const channels = useMemo(() => {
    const opts = channelOptions?.length ? channelOptions : [channel];
    return [...new Set(opts)];
  }, [channel, channelOptions]);

  useEffect(() => {
    if (!open) return;
    setEditBody(body);
    setEditSubject(subject ?? '');
    setTone('professional');
    setSendMode('now');
    setScheduledFor(defaultScheduleLocal());
    setActiveChannel(channel);
  }, [open, body, subject, channel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const applyTone = (t: MessageTone) => {
    setTone(t);
    const variant = toneVariants?.[t];
    if (variant) setEditBody(variant);
  };

  const finalPayload = {
    body: editBody.trim(),
    subject: activeChannel === 'email' ? editSubject.trim() : undefined,
    channel: activeChannel,
    tone,
  };

  const canSubmit = Boolean(editBody.trim()) && Boolean(recipient) && (activeChannel !== 'email' || editSubject.trim());

  return (
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/75 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gold/25 bg-zinc-950 shadow-2xl">
        <div className="shrink-0 border-b border-white/8 p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">{title}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {activeChannel === 'sms' ? 'SMS' : 'Email'} → <span className="text-white">{recipient || '—'}</span>
            {contextLabel ? <span className="text-zinc-600"> · {contextLabel}</span> : null}
          </p>
          {(priceCents != null || durationMinutes != null) && (
            <p className="mt-2 text-[11px] text-zinc-400">
              {priceCents != null ? <>Quote: {displayMoney(priceCents)}</> : null}
              {priceCents != null && durationMinutes != null ? ' · ' : null}
              {durationMinutes != null ? <>~{durationMinutes} min</> : null}
            </p>
          )}
          {channels.length > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {channels.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveChannel(c)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
                    activeChannel === c ? 'bg-gold text-black' : 'border border-white/10 text-zinc-400'
                  }`}
                >
                  {c === 'sms' ? 'SMS' : 'Email'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {toneVariants ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {(['quick', 'professional', 'warm'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => applyTone(t)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
                    tone === t ? 'bg-gold text-black' : 'border border-white/10 text-zinc-400'
                  }`}
                >
                  {MESSAGE_TONE_LABELS[t]}
                </button>
              ))}
            </div>
          ) : null}

          {allowSchedule && onSchedule ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSendMode('now')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
                  sendMode === 'now' ? 'bg-white/10 text-white' : 'border border-white/10 text-zinc-500'
                }`}
              >
                Send now
              </button>
              <button
                type="button"
                onClick={() => setSendMode('schedule')}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${
                  sendMode === 'schedule' ? 'bg-white/10 text-white' : 'border border-white/10 text-zinc-500'
                }`}
              >
                Schedule
              </button>
            </div>
          ) : null}

          {sendMode === 'schedule' && onSchedule ? (
            <label className="mb-4 block text-xs text-zinc-400">
              Send at (local time)
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
              />
            </label>
          ) : null}

          {activeChannel === 'email' ? (
            <label className="mb-3 block text-xs text-zinc-400">
              Subject
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
              />
            </label>
          ) : null}

          <label className="block text-xs text-zinc-400">
            Message (editable)
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={activeChannel === 'sms' ? 6 : 10}
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
            />
          </label>
          {activeChannel === 'sms' ? (
            <p className="mt-1 text-[10px] text-zinc-600">{editBody.length} characters</p>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 border-t border-white/8 p-4 sm:p-5">
          <button
            type="button"
            disabled={busy || !canSubmit}
            onClick={() => {
              if (sendMode === 'schedule' && onSchedule) {
                onSchedule({ ...finalPayload, scheduledFor: new Date(scheduledFor).toISOString() });
              } else {
                onSend(finalPayload);
              }
            }}
            className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            {busy ? 'Working…' : sendMode === 'schedule' ? 'Schedule send' : sendLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              const text = activeChannel === 'email' ? `Subject: ${editSubject}\n\n${editBody}` : editBody;
              void navigator.clipboard.writeText(text);
              onCopy?.(text);
            }}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-300"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
