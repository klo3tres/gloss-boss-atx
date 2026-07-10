'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send } from 'lucide-react';
import type { MarketingCampaign } from '@/lib/business-modules';
import { saveMarketingCampaignsAction, sendMarketingCampaignAction } from '@/app/(dashboard)/admin/marketing/actions';

export function MarketingCampaignsPanel({ initialCampaigns }: { initialCampaigns: MarketingCampaign[] }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [, startSend] = useTransition();

  const add = () => {
    setCampaigns((prev) => [
      {
        id: crypto.randomUUID(),
        name: 'Seasonal detail promo',
        channel: 'email',
        audience: 'Customers with completed jobs in last 90 days',
        message: '',
        scheduledAt: null,
        status: 'draft',
        sentCount: 0,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const sendOne = (id: string) => {
    setMsg(null);
    setSendingId(id);
    startSend(async () => {
      const fd = new FormData();
      fd.set('campaigns', JSON.stringify(campaigns));
      await saveMarketingCampaignsAction(fd);
      const res = await sendMarketingCampaignAction(id);
      setSendingId(null);
      if (res.error) setMsg(res.error + (res.details ? ` — ${res.details}` : ''));
      else setMsg(`Sent to ${res.sent ?? 0} recipients${res.skipped ? ` (${res.skipped} skipped)` : ''}.`);
      router.refresh();
    });
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.set('campaigns', JSON.stringify(campaigns));
    await saveMarketingCampaignsAction(fd);
    setBusy(false);
    setMsg('Campaigns saved.');
    router.refresh();
  };

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-gold-soft">Marketing campaigns</p>
          <p className="mt-1 text-xs text-muted-foreground">Draft audiences, channels, and scheduled outreach.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={add} className="rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase text-muted-foreground">
            New campaign
          </button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">
            {busy ? 'Saving…' : 'Save all'}
          </button>
        </div>
      </div>
      {msg ? <p className="mt-3 text-xs text-emerald-400">{msg}</p> : null}
      <div className="mt-4 space-y-3">
        {campaigns.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No campaigns yet. Create one to plan email, SMS, or social pushes.
          </p>
        ) : (
          campaigns.map((c, idx) => (
            <div key={c.id} className="rounded-2xl border border-border bg-muted/20 p-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  value={c.name}
                  onChange={(e) => setCampaigns((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold"
                />
                <select
                  value={c.channel}
                  onChange={(e) =>
                    setCampaigns((prev) => prev.map((x, i) => (i === idx ? { ...x, channel: e.target.value as MarketingCampaign['channel'] } : x)))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  {['email', 'sms', 'social', 'referral'].map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
                <select
                  value={c.status}
                  onChange={(e) =>
                    setCampaigns((prev) => prev.map((x, i) => (i === idx ? { ...x, status: e.target.value as MarketingCampaign['status'] } : x)))
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  {['draft', 'scheduled', 'sent', 'paused'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={c.audience}
                onChange={(e) => setCampaigns((prev) => prev.map((x, i) => (i === idx ? { ...x, audience: e.target.value } : x)))}
                placeholder="Audience"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <textarea
                value={c.message}
                onChange={(e) => setCampaigns((prev) => prev.map((x, i) => (i === idx ? { ...x, message: e.target.value } : x)))}
                placeholder="Message — use {name} for first name"
                rows={3}
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="datetime-local"
                  value={c.scheduledAt ? c.scheduledAt.slice(0, 16) : ''}
                  onChange={(e) =>
                    setCampaigns((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null } : x)),
                    )
                  }
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                />
                {(c.channel === 'email' || c.channel === 'sms') && c.status !== 'sent' ? (
                  <button
                    type="button"
                    disabled={sendingId === c.id || !c.message.trim()}
                    onClick={() => sendOne(c.id)}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    {sendingId === c.id ? 'Sending…' : 'Send now'}
                  </button>
                ) : null}
                {c.sentCount > 0 ? (
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Sent: {c.sentCount}</span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
