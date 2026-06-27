'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Copy, Plus } from 'lucide-react';
import type { RevenueOpportunity, RevenueOpportunityEvent } from '@/lib/titan/revenue-opportunities';
import {
  OPPORTUNITY_TYPE_LABELS,
  STATUS_LABELS,
} from '@/lib/titan/revenue-opportunities';
import { displayMoney } from '@/lib/display-format';
import {
  createOpportunityAction,
  markOpportunityStatusAction,
  scheduleFollowUpAction,
  seedWarmLeadsAction,
  sendOpportunitySmsAction,
  syncDerivedOpportunitiesAction,
} from '@/app/(dashboard)/admin/titan/opportunity-actions';

const TYPES = Object.entries(OPPORTUNITY_TYPE_LABELS);

function money(cents: number) {
  return displayMoney(cents);
}

function AddModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('warm_lead');
  const [revenue, setRevenue] = useState('175');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [social, setSocial] = useState('');
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState('');

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await createOpportunityAction({
        title,
        opportunityType: type,
        estimatedRevenueDollars: Number(revenue) || 0,
        contactName,
        contactPhone: phone,
        contactEmail: email,
        socialUrl: social,
        notes,
        recommendedAction: action,
      });
      if (res.error) setErr(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-emerald-500/25 bg-zinc-950 p-6 shadow-2xl">
        <h2 className="text-xl font-black text-white">Add opportunity</h2>
        <div className="mt-4 grid gap-3">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white">
            {TYPES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Est. revenue ($)" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={social} onChange={(e) => setSocial(e.target.value)} placeholder="Social / profile URL" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Recommended action" className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white" />
        </div>
        {err ? <p className="mt-2 text-xs text-rose-300">{err}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50">Save</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 text-[10px] font-black uppercase text-zinc-400">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function OpportunityCard({ opp, events }: { opp: RevenueOpportunity; events: RevenueOpportunityEvent[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [customDate, setCustomDate] = useState('');

  const act = (fn: () => Promise<{ ok?: boolean; error?: string }>, success: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setMsg(res.error);
      else {
        setMsg(success);
        router.refresh();
      }
    });
  };

  return (
    <article className="rounded-2xl border border-white/10 bg-black/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-emerald-300">{OPPORTUNITY_TYPE_LABELS[opp.opportunityType] ?? opp.opportunityType}</p>
          <h3 className="mt-1 text-lg font-black text-white">{opp.title}</h3>
          <p className="mt-1 text-xs text-zinc-500">Source: {opp.source} · {STATUS_LABELS[opp.status]}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-black text-emerald-300">{money(opp.estimatedRevenueCents)}</p>
          <p className="text-[10px] text-zinc-500">{opp.confidenceScore}% confidence</p>
        </div>
      </div>

      <p className="mt-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100">
        <span className="font-black uppercase text-cyan-300">Why Titan surfaced this: </span>
        {opp.whySurfaced}
      </p>

      {opp.recommendedAction ? <p className="mt-2 text-xs text-zinc-400"><span className="font-bold text-white">Action:</span> {opp.recommendedAction}</p> : null}

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
        {opp.contactName ? <span>{opp.contactName}</span> : null}
        {opp.contactPhone ? <a href={`tel:${opp.contactPhone}`} className="text-emerald-300">{opp.contactPhone}</a> : null}
        {opp.contactEmail ? <a href={`mailto:${opp.contactEmail}`} className="text-emerald-300">{opp.contactEmail}</a> : null}
        {opp.socialUrl ? (
          <a href={opp.socialUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-300">Profile</a>
        ) : null}
      </div>

      {opp.notes ? <p className="mt-2 text-xs text-zinc-500">{opp.notes}</p> : null}

      <p className="mt-3 rounded-xl border border-white/6 bg-white/5 p-3 text-xs italic text-zinc-300">{opp.recommendedMessage}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {opp.contactPhone ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => sendOpportunitySmsAction(opp.id, opp.recommendedMessage), 'SMS sent')}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
          >
            Send SMS
          </button>
        ) : null}
        <button type="button" onClick={() => { void navigator.clipboard.writeText(opp.recommendedMessage); setMsg('Copied.'); }} className="inline-flex items-center gap-1 rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black">
          <Copy className="h-3 w-3" /> Copy
        </button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'contacted', 'Customer replied'), 'Marked replied')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50">Replied</button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'contacted'), 'Contacted')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50">Contacted</button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'booked'), 'Booked!')} className="rounded-lg border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50">Booked</button>
        <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'lost'), 'Lost')} className="rounded-lg border border-rose-500/25 px-3 py-2 text-[10px] font-black uppercase text-rose-200 disabled:opacity-50">Lost</button>
        <button type="button" disabled={pending} onClick={() => setShowFollowUp((v) => !v)} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">Follow-up</button>
      </div>

      {showFollowUp ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/8 pt-3">
          {(['tomorrow', '2days', '3days', '1week'] as const).map((p) => (
            <button key={p} type="button" disabled={pending} onClick={() => act(() => scheduleFollowUpAction(opp.id, p), 'Scheduled')} className="rounded-lg bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-white">
              {p === 'tomorrow' ? 'Tomorrow' : p === '2days' ? '2 days' : p === '3days' ? '3 days' : '1 week'}
            </button>
          ))}
          <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white" />
          <button type="button" disabled={!customDate || pending} onClick={() => act(() => scheduleFollowUpAction(opp.id, 'custom', `${customDate}T10:00:00`), 'Scheduled')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-white">Custom</button>
        </div>
      ) : null}

      {events.length > 0 ? (
        <details className="mt-4 border-t border-white/8 pt-3">
          <summary className="cursor-pointer text-[10px] font-black uppercase text-zinc-500">Event history ({events.length})</summary>
          <ul className="mt-2 space-y-1">
            {events.map((e) => (
              <li key={e.id} className="text-[10px] text-zinc-500">
                {new Date(e.createdAt).toLocaleString()} — <span className="text-emerald-300">{e.eventType}</span>
                {e.notes ? `: ${e.notes}` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {msg ? <p className="mt-2 text-xs text-emerald-200">{msg}</p> : null}
    </article>
  );
}

export function TitanOpportunitiesClient({
  opportunities,
  eventsByOpp,
  tablesReady,
}: {
  opportunities: RevenueOpportunity[];
  eventsByOpp: Record<string, RevenueOpportunityEvent[]>;
  tablesReady: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('add') === '1') setAddOpen(true);
  }, [searchParams]);

  if (!tablesReady) {
    return (
      <div className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6">
        <p className="text-sm text-amber-100">Apply migration 000100 in Supabase to enable Titan opportunities.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/titan" className="text-[10px] font-black uppercase text-zinc-500 hover:text-white">← Titan</Link>
          <h1 className="mt-2 text-2xl font-black text-white">Opportunity Board</h1>
          <p className="mt-1 text-sm text-zinc-400">{opportunities.length} revenue opportunities — manual mode works without any API.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black">
            <Plus className="h-3.5 w-3.5" /> Add opportunity
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await seedWarmLeadsAction();
              setBanner(res.error ?? (res.inserted ? `Seeded ${res.inserted} warm leads.` : 'Warm leads already present.'));
              router.refresh();
            })}
            className="rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
          >
            Seed warm leads
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await syncDerivedOpportunitiesAction();
              setBanner(res.error ?? `Imported ${res.created ?? 0} from CRM data.`);
              router.refresh();
            })}
            className="rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50"
          >
            Sync from CRM
          </button>
        </div>
      </header>

      {banner ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{banner}</p> : null}

      {opportunities.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-black/40 p-8 text-center">
          <p className="text-sm font-bold text-white">Titan needs opportunities to hunt.</p>
          <p className="mt-2 text-xs text-zinc-400">Add your warm leads first: nurses, coworkers, referrals, apartments, Facebook posts, and canceled bookings.</p>
          <button type="button" onClick={() => setAddOpen(true)} className="mt-4 rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black">Add first opportunity</button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {opportunities.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} events={eventsByOpp[opp.id] ?? []} />
          ))}
        </div>
      )}

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
