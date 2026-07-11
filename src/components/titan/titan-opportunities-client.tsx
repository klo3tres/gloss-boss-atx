'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { RevenueOpportunity, RevenueOpportunityEvent } from '@/lib/titan/revenue-opportunities';
import {
  OPPORTUNITY_TYPE_LABELS,
  STATUS_LABELS,
} from '@/lib/titan/revenue-opportunities';
import { displayMoney } from '@/lib/display-format';
import {
  createOpportunityAction,
  seedWarmLeadsAction,
  syncDerivedOpportunitiesAction,
} from '@/app/(dashboard)/admin/titan/opportunity-actions';
import { OpportunityDrawer } from '@/components/titan/opportunity-drawer';
import { EmptyState } from '@/components/ui/empty-state';
import type { ScriptBranding } from '@/lib/titan/script-branding-types';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 sm:items-center" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-emerald-500/25 bg-card p-6 shadow-2xl">
        <h2 className="text-xl font-black text-foreground">Add opportunity</h2>
        <div className="mt-4 grid gap-3">
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground">
            {TYPES.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <input type="number" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Est. revenue ($)" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <input value={social} onChange={(e) => setSocial(e.target.value)} placeholder="Social / profile URL" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Recommended action" className="rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground" />
        </div>
        {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" disabled={pending} className="rounded-xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50">Save</button>
          <button type="button" onClick={onClose} className="rounded-xl border border-border px-4 py-3 text-[10px] font-black uppercase text-muted-foreground">Cancel</button>
        </div>
      </form>
    </div>
  );
}

function OpportunityCard({
  opp,
  events,
  onOpen,
}: {
  opp: RevenueOpportunity;
  events: RevenueOpportunityEvent[];
  serviceOptions: { slug: string; title: string; priceCents?: number; durationMinutes?: number }[];
  onOpen: () => void;
}) {
  const ext = opp as RevenueOpportunity & {
    businessName?: string | null;
    businessAddress?: string | null;
    websiteUrl?: string | null;
    estimatedVehicleCount?: number | null;
  };
  const preview = opp.notes?.trim() || opp.whySurfaced || opp.recommendedAction || 'Click to open workflow and outreach scripts.';
  const contactBits = [
    opp.contactName,
    opp.contactPhone,
    opp.contactEmail,
    ext.websiteUrl?.replace(/^https?:\/\//, ''),
  ].filter(Boolean);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-emerald-500/30 hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-300">{OPPORTUNITY_TYPE_LABELS[opp.opportunityType] ?? opp.opportunityType}</p>
          <h3 className="mt-1 text-lg font-black text-foreground">{ext.businessName ?? opp.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">Source: {opp.source} · {STATUS_LABELS[opp.status as keyof typeof STATUS_LABELS] ?? opp.status}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-300">{money(opp.estimatedRevenueCents)}</p>
          <p className="text-[10px] text-muted-foreground">{opp.confidenceScore}% confidence</p>
        </div>
      </div>
      {contactBits.length > 0 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">{contactBits.join(' · ')}</p>
      ) : null}
      {ext.estimatedVehicleCount ? (
        <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">~{ext.estimatedVehicleCount} vehicles</p>
      ) : null}
      <p className="mt-3 line-clamp-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 text-xs text-foreground">
        {preview}
      </p>
      <p className="mt-3 text-[10px] font-black uppercase text-gold-soft">Click to open workflow →</p>
      {events.length > 0 ? <p className="mt-1 text-[10px] text-muted-foreground">{events.length} events logged</p> : null}
    </article>
  );
}

export function TitanOpportunitiesClient({
  opportunities,
  eventsByOpp,
  tablesReady,
  serviceOptions = [],
  scriptBranding = null,
}: {
  opportunities: RevenueOpportunity[];
  eventsByOpp: Record<string, RevenueOpportunityEvent[]>;
  tablesReady: boolean;
  serviceOptions?: { slug: string; title: string; priceCents?: number; durationMinutes?: number }[];
  scriptBranding?: ScriptBranding | null;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<string | null>(null);
  const [drawerOpp, setDrawerOpp] = useState<RevenueOpportunity | null>(null);

  useEffect(() => {
    if (searchParams.get('add') === '1') setAddOpen(true);
    const openId = searchParams.get('open');
    if (openId) {
      const found = opportunities.find((o) => o.id === openId);
      if (found) setDrawerOpp(found);
    }
  }, [searchParams, opportunities]);

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
          <Link href="/admin/titan" className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground">← Titan</Link>
          <h1 className="mt-2 text-2xl font-black text-foreground">Opportunity Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">{opportunities.length} revenue opportunities — contact names, phones, and dynamic scripts load per lead.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-4 py-2 text-[10px] font-black uppercase text-black">
            <Plus className="h-3.5 w-3.5" /> Add opportunity
          </button>
          {process.env.NODE_ENV !== 'production' ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => {
                const res = await seedWarmLeadsAction();
                setBanner(res.error ?? (res.inserted ? `Seeded ${res.inserted} warm leads.` : 'Demo seeds disabled or already present.'));
                router.refresh();
              })}
              className="rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50"
            >
              Seed warm leads (dev)
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => {
              const res = await syncDerivedOpportunitiesAction();
              setBanner(res.error ?? `Imported ${res.created ?? 0} from CRM data.`);
              router.refresh();
            })}
            className="rounded-xl border border-border px-4 py-2 text-[10px] font-black uppercase text-muted-foreground disabled:opacity-50"
          >
            Sync from CRM
          </button>
        </div>
      </header>

      {banner ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-100">{banner}</p> : null}

      {opportunities.length === 0 ? (
        <EmptyState
          title="No opportunities yet"
          description="Import warm leads, sync from CRM, or run Lead Radar to populate your revenue board."
          primaryAction={{ label: 'Add opportunity', onClick: () => setAddOpen(true) }}
          secondaryAction={{ label: 'Open Lead Radar', href: '/admin/titan/lead-radar' }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {opportunities.map((opp) => (
            <OpportunityCard
              key={opp.id}
              opp={opp}
              events={eventsByOpp[opp.id] ?? []}
              serviceOptions={serviceOptions}
              onOpen={() => setDrawerOpp(opp)}
            />
          ))}
        </div>
      )}

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} />

      {drawerOpp ? (
        <OpportunityDrawer
          opp={drawerOpp}
          events={eventsByOpp[drawerOpp.id] ?? []}
          serviceOptions={serviceOptions}
          scriptBranding={scriptBranding}
          onClose={() => setDrawerOpp(null)}
        />
      ) : null}
    </div>
  );
}
