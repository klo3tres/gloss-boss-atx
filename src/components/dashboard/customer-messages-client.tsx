'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';
import { GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';

type Msg = {
  id: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  adminReply: string | null;
  repliedAt: string | null;
};

function chicago(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function CustomerMessagesClient({
  customerEmail,
  initialAppointmentId,
}: {
  customerEmail: string;
  initialAppointmentId?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/customer/messages', {
        cache: 'no-store',
        signal: controller.signal,
      });
      const result = (await response.json().catch(() => ({}))) as {
        messages?: Msg[];
        error?: string;
      };
      if (!response.ok) {
        setError(result.error ?? 'Could not load messages.');
        return;
      }
      setMessages(result.messages ?? []);
      setError(null);
    } catch {
      setError('Messages could not be loaded. Check your connection and try again.');
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(refresh);
  }, [load]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/customer/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          subject: subject.trim() || (initialAppointmentId ? 'Appointment question' : 'Question'),
          message: body.trim(),
          appointmentId: initialAppointmentId,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        note?: string | null;
      };
      if (!response.ok) {
        setError(result.error ?? 'Message could not be sent.');
        return;
      }
      setBody('');
      setSubject('');
      setOk(
        result.note
          ? `Message saved. ${result.note}. We usually reply within 24–48 hours.`
          : 'Message sent. We usually reply within 24–48 hours.',
      );
      await load();
    } catch {
      setError('The message was not confirmed. Check your connection and try again.');
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <GlassCard>
        <SectionEyebrow>Send a message</SectionEyebrow>
        <p className="mt-2 text-sm text-zinc-400">
          Messages go directly to Gloss Boss ATX support at{' '}
          <a href={`mailto:${GLOSS_BOSS_SUPPORT_EMAIL}`} className="font-semibold text-gold-soft underline">
            {GLOSS_BOSS_SUPPORT_EMAIL}
          </a>
          . We usually reply within 24–48 hours.
        </p>
        <p className="mt-1 text-xs text-zinc-500">Signed in as {customerEmail}.</p>
        <form onSubmit={send} className="mt-4 space-y-3">
          {initialAppointmentId ? (
            <p className="rounded-xl border border-gold/20 bg-gold/5 px-3 py-2 text-xs text-gold-soft">
              This message will be attached to appointment {initialAppointmentId.slice(0, 8).toUpperCase()}.
            </p>
          ) : null}
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={160}
            placeholder="Subject (optional)"
            className="gb-input w-full"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            placeholder="Your message"
            required
            rows={5}
            className="gb-input w-full"
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-2xl bg-gold px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </form>
        {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
        {ok ? <p role="status" className="mt-3 text-sm text-emerald-300">{ok}</p> : null}
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between gap-3">
          <SectionEyebrow>Conversation</SectionEyebrow>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
        <ul className="mt-4 space-y-4">
          {loading && messages.length === 0 ? <li className="text-sm text-zinc-500">Loading messages…</li> : null}
          {!loading && messages.length === 0 ? <li className="text-sm text-zinc-500">No messages yet.</li> : null}
          {messages.map((message) => (
            <li key={message.id} className="rounded-2xl border border-white/10 bg-black/35 p-4">
              <p className="text-xs font-bold uppercase text-gold-soft">{message.subject}</p>
              <p className="mt-1 text-xs text-zinc-500">{chicago(message.createdAt)} · {message.status}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-200">{message.body}</p>
              {message.adminReply ? (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-[10px] font-black uppercase text-emerald-300">
                    Gloss Boss reply{message.repliedAt ? ` · ${chicago(message.repliedAt)}` : ''}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">{message.adminReply}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
