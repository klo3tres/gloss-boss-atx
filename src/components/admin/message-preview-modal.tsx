'use client';

import { useEffect } from 'react';

export function MessagePreviewModal({
  open,
  title,
  channel,
  recipient,
  body,
  contextLabel,
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
  contextLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onSend: () => void;
  onCopy?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl border border-gold/25 bg-zinc-950 p-5 shadow-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">
          {channel === 'sms' ? 'SMS' : 'Email'} → <span className="text-white">{recipient || '—'}</span>
          {contextLabel ? <span className="text-zinc-600"> · {contextLabel}</span> : null}
        </p>
        <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/60 p-3 text-xs leading-relaxed text-zinc-200">
          {body}
        </pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onSend}
            className="rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
          {onCopy ? (
            <button
              type="button"
              onClick={onCopy}
              className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300"
            >
              Copy
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
