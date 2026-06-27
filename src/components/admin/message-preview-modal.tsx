'use client';

import { useEffect, useState } from 'react';
import type { MessageTone } from '@/lib/outbound-message-tones';
import { MESSAGE_TONE_LABELS } from '@/lib/outbound-message-tones';
import { displayMoney } from '@/lib/display-format';

export function MessagePreviewModal({
  open,
  title,
  channel,
  recipient,
  body,
  subject,
  contextLabel,
  toneVariants,
  priceCents,
  durationMinutes,
  busy,
  onCancel,
  onSend,
  onCopy,
}: {
  open: boolean;
  title: string;
  channel: 'sms' | 'email';
  recipient: string;
  body: string;
  subject?: string;
  contextLabel?: string;
  toneVariants?: Partial<Record<MessageTone, string>>;
  priceCents?: number;
  durationMinutes?: number;
  busy?: boolean;
  onCancel: () => void;
  onSend: (final: { body: string; subject?: string }) => void;
  onCopy?: (text: string) => void;
}) {
  const [editBody, setEditBody] = useState(body);
  const [editSubject, setEditSubject] = useState(subject ?? '');
  const [tone, setTone] = useState<MessageTone>('professional');

  useEffect(() => {
    if (!open) return;
    setEditBody(body);
    setEditSubject(subject ?? '');
    setTone('professional');
  }, [open, body, subject]);

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
            {channel === 'sms' ? 'SMS' : 'Email'} → <span className="text-white">{recipient || '—'}</span>
            {contextLabel ? <span className="text-zinc-600"> · {contextLabel}</span> : null}
          </p>
          {(priceCents != null || durationMinutes != null) && (
            <p className="mt-2 text-[11px] text-zinc-400">
              {priceCents != null ? <>Quote: {displayMoney(priceCents)}</> : null}
              {priceCents != null && durationMinutes != null ? ' · ' : null}
              {durationMinutes != null ? <>~{durationMinutes} min</> : null}
            </p>
          )}
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

          {channel === 'email' ? (
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
              rows={channel === 'sms' ? 6 : 10}
              className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200"
            />
          </label>
          {channel === 'sms' ? (
            <p className="mt-1 text-[10px] text-zinc-600">{editBody.length} characters</p>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 border-t border-white/8 p-4 sm:p-5">
          <button
            type="button"
            disabled={busy || !editBody.trim()}
            onClick={() => onSend({ body: editBody.trim(), subject: channel === 'email' ? editSubject.trim() : undefined })}
            className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
          <button
            type="button"
            onClick={() => {
              const text = channel === 'email' ? `Subject: ${editSubject}\n\n${editBody}` : editBody;
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
