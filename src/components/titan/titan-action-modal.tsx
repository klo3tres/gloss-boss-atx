'use client';

import { useEffect, useState, useTransition } from 'react';
import { X, Phone, Mail, MessageSquare, Copy, Check, CalendarClock } from 'lucide-react';
import {
  recordOutcomeAction,
  scheduleCadenceAction,
} from '@/app/(dashboard)/admin/titan/titan-1-actions';
import type { ActionOutcome } from '@/lib/titan/engines/action-outcomes';
import { OUTCOME_LABELS } from '@/lib/titan/engines/action-outcomes';
import { displayMoney } from '@/lib/display-format';

export type TitanActionModalPayload = {
  actionId: string;
  title: string;
  recipient: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  reason: string;
  expectedRevenueCents: number;
  message: string;
  href: string;
  channel?: 'sms' | 'email' | 'call';
  twilioReady?: boolean;
  resendReady?: boolean;
};

type Props = {
  open: boolean;
  payload: TitanActionModalPayload | null;
  onClose: () => void;
};

const TEMPLATES = [
  { id: 'default', label: 'Default outreach' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'review', label: 'Review request' },
  { id: 'referral', label: 'Referral ask' },
];

export function TitanActionModal({ open, payload, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [template, setTemplate] = useState('default');
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (payload) {
      setMessage(payload.message);
      setTemplate('default');
      setFeedback(null);
      setCopied(false);
    }
  }, [payload]);

  if (!open || !payload) return null;

  const money = displayMoney(payload.expectedRevenueCents);
  const canSms = Boolean(payload.recipientPhone) && payload.twilioReady !== false;
  const canEmail = Boolean(payload.recipientEmail) && payload.resendReady !== false;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setFeedback('Copied to clipboard — paste into your SMS or email app.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback('Could not copy. Select the text manually.');
    }
  };

  const markSent = () => {
    setFeedback('Marked as sent manually. Log an outcome when you get a response.');
  };

  const logOutcome = (outcome: ActionOutcome) => {
    startTransition(async () => {
      const res = await recordOutcomeAction(payload.actionId, outcome);
      if (res.error) setFeedback(res.error);
      else {
        setFeedback(`Logged: ${OUTCOME_LABELS[outcome]}`);
        onClose();
      }
    });
  };

  const scheduleFollowUp = () => {
    startTransition(async () => {
      const res = await scheduleCadenceAction(payload.actionId, payload.title);
      if (res.error) setFeedback(res.error);
      else setFeedback('Follow-up scheduled for day 2 and day 4.');
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-emerald-500/25 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Titan action</p>
            <h2 className="mt-1 text-lg font-black text-white">{payload.title}</h2>
            <p className="mt-1 text-xs text-zinc-500">{payload.reason}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-white/8 bg-black/50 p-3">
            <dt className="text-[10px] uppercase text-zinc-600">Recipient</dt>
            <dd className="mt-1 font-bold text-white">{payload.recipient}</dd>
          </div>
          <div className="rounded-xl border border-white/8 bg-black/50 p-3">
            <dt className="text-[10px] uppercase text-zinc-600">Expected revenue</dt>
            <dd className="mt-1 font-mono font-black text-emerald-300">{money}</dd>
          </div>
        </dl>

        <label className="mt-4 block text-[10px] font-black uppercase text-zinc-500">
          Template
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
          >
            {TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-[10px] font-black uppercase text-zinc-500">
          Message (editable)
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
        </label>

        {!canSms && !canEmail ? (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            Manual mode — Twilio/Resend not configured. Copy the message and send from your phone or email app.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyMessage}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black px-3 py-2 text-[10px] font-black uppercase text-white hover:border-emerald-500/40"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            Copy
          </button>
          {payload.recipientPhone ? (
            <a
              href={`tel:${payload.recipientPhone}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black px-3 py-2 text-[10px] font-black uppercase text-white hover:border-cyan-500/40"
            >
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          ) : null}
          {payload.recipientEmail ? (
            <a
              href={`mailto:${payload.recipientEmail}?subject=${encodeURIComponent(payload.title)}&body=${encodeURIComponent(message)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-black px-3 py-2 text-[10px] font-black uppercase text-white hover:border-blue-500/40"
            >
              <Mail className="h-3.5 w-3.5" /> Email draft
            </a>
          ) : null}
          <button
            type="button"
            onClick={copyMessage}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase text-emerald-200"
          >
            <MessageSquare className="h-3.5 w-3.5" /> SMS draft (copy)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={markSent}
            className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300"
          >
            Mark sent manually
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={scheduleFollowUp}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[10px] font-black uppercase text-violet-200"
          >
            <CalendarClock className="h-3.5 w-3.5" /> Schedule follow-up
          </button>
        </div>

        <p className="mt-4 text-[10px] font-black uppercase text-zinc-600">Log outcome</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(Object.keys(OUTCOME_LABELS) as ActionOutcome[]).slice(0, 6).map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => logOutcome(o)}
              className="rounded-md border border-white/8 px-2 py-1 text-[9px] font-bold text-zinc-400 hover:border-emerald-500/30 hover:text-emerald-200"
            >
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>

        {feedback ? <p className="mt-3 text-xs text-emerald-200">{feedback}</p> : null}

        <a href={payload.href} className="mt-4 inline-block text-[10px] font-black uppercase text-gold-soft hover:underline">
          Open related record →
        </a>
      </div>
    </div>
  );
}
