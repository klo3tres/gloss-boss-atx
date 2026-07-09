'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Copy, Mail, MessageSquare, Phone, X } from 'lucide-react';
import type { RevenueOpportunity, RevenueOpportunityEvent } from '@/lib/titan/revenue-opportunities';
import { OPPORTUNITY_TYPE_LABELS, STATUS_LABELS } from '@/lib/titan/revenue-opportunities';
import { displayMoney } from '@/lib/display-format';
import {
  addOpportunityNoteAction,
  markOpportunityStatusAction,
  scheduleFollowUpAction,
  seedOpportunityAction,
  snoozeOpportunityAction,
} from '@/app/(dashboard)/admin/titan/opportunity-actions';
import { sendPreviewedEmailAction, sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildOpportunityScripts, explainOpportunityValue, type OpportunityScriptKey } from '@/lib/opportunity-pipeline-scripts';
import { FleetQuoteWizard } from '@/components/admin/fleet-quote-wizard';
import { QuoteBuilderPanel } from '@/components/admin/quote-builder-panel';

const SCRIPT_LABELS: Record<OpportunityScriptKey, string> = {
  call_script: 'Call script',
  sms_pitch: 'SMS pitch',
  email_pitch: 'Email pitch',
  follow_up_no_response: 'Follow-up (no response)',
  quote_intro: 'Quote intro',
};

export function OpportunityDrawer({
  opp,
  events,
  serviceOptions,
  onClose,
}: {
  opp: RevenueOpportunity;
  events: RevenueOpportunityEvent[];
  serviceOptions: { slug: string; title: string; priceCents?: number; durationMinutes?: number }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'profile' | 'scripts' | 'quote'>('profile');
  const [msg, setMsg] = useState<string | null>(null);

  const ext = opp as RevenueOpportunity & {
    businessName?: string | null;
    businessCategory?: string | null;
    businessAddress?: string | null;
    websiteUrl?: string | null;
    estimatedVehicleCount?: number | null;
    distanceMiles?: number | null;
    valueExplanation?: string | null;
    followUpCadencePaused?: boolean;
  };

  const scripts = useMemo(
    () =>
      buildOpportunityScripts(opp, {
        businessName: ext.businessName ?? opp.title,
        category: ext.businessCategory ?? String(opp.opportunityType),
        contactName: opp.contactName,
        vehicleCount: ext.estimatedVehicleCount ?? null,
        address: ext.businessAddress ?? null,
        estimatedValue: displayMoney(opp.estimatedRevenueCents),
      }),
    [opp, ext],
  );

  const valueExplain = ext.valueExplanation || explainOpportunityValue(opp);
  const isFleet = ['fleet', 'dealership', 'apartment_hoa', 'google_places'].includes(String(opp.opportunityType));

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

  const previewSend = (channel: 'sms' | 'email', scriptKey: OpportunityScriptKey) => {
    const recipient = channel === 'sms' ? opp.contactPhone : opp.contactEmail;
    if (!recipient) {
      setMsg(channel === 'sms' ? 'No phone on file — add a phone number first.' : 'No email on file — add an email first.');
      return;
    }
    const body = scripts[scriptKey];
    openPreview({
      title: SCRIPT_LABELS[scriptKey],
      channel,
      recipient,
      body,
      subject: channel === 'email' ? `Gloss Boss ATX — ${opp.title}` : undefined,
      contextLabel: `Opportunity · ${opp.title}`,
      priceCents: opp.estimatedRevenueCents,
      onSend: async (final) => {
        const res =
          channel === 'sms'
            ? await sendPreviewedSmsAction({
                to: recipient,
                body: final.body,
                kind: 'opportunity_outreach',
                templateKey: scriptKey,
                entityType: 'opportunity',
                entityId: opp.id,
              })
            : await sendPreviewedEmailAction({
                to: recipient,
                subject: final.subject ?? `Gloss Boss ATX — ${opp.title}`,
                body: final.body,
                kind: 'opportunity_outreach',
                entityType: 'opportunity',
                entityId: opp.id,
              });
        if (!res.error) await markOpportunityStatusAction(opp.id, 'contacted', `${SCRIPT_LABELS[scriptKey]} sent`);
        router.refresh();
        return res;
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/70" role="dialog" aria-modal>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-emerald-500/20 bg-zinc-950 shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
              {OPPORTUNITY_TYPE_LABELS[opp.opportunityType] ?? opp.opportunityType}
            </p>
            <h2 className="mt-1 text-xl font-black text-white">{ext.businessName ?? opp.title}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {STATUS_LABELS[opp.status as keyof typeof STATUS_LABELS] ?? opp.status} · Source: {opp.source}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-white/8 px-5 py-2">
          {(['profile', 'scripts', 'quote'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${tab === t ? 'bg-emerald-500 text-black' : 'text-zinc-500'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'profile' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-4">
                <p className="text-[10px] font-black uppercase text-cyan-300">Estimated value</p>
                <p className="mt-1 font-mono text-2xl font-black text-white">{displayMoney(opp.estimatedRevenueCents)}</p>
                <p className="mt-2 text-xs text-cyan-100/80">{valueExplain}</p>
              </div>

              <dl className="space-y-2 text-sm">
                {ext.businessAddress ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Address</dt>
                    <dd className="text-zinc-200">{ext.businessAddress}</dd>
                  </div>
                ) : null}
                {ext.websiteUrl ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Website</dt>
                    <dd>
                      <a href={ext.websiteUrl} target="_blank" rel="noreferrer" className="text-emerald-300">
                        {ext.websiteUrl}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {ext.estimatedVehicleCount ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Vehicles</dt>
                    <dd className="text-zinc-200">~{ext.estimatedVehicleCount}</dd>
                  </div>
                ) : null}
                {ext.distanceMiles != null ? (
                  <div className="flex gap-2">
                    <dt className="text-zinc-500">Distance</dt>
                    <dd className="text-zinc-200">{ext.distanceMiles} mi</dd>
                  </div>
                ) : null}
              </dl>

              <p className="rounded-xl border border-white/8 bg-black/40 p-3 text-xs text-zinc-300">
                <span className="font-black text-gold-soft">Why Titan thinks it fits: </span>
                {opp.whySurfaced}
              </p>

              {opp.notes ? <p className="text-xs text-zinc-500">{opp.notes}</p> : null}

              <div className="flex flex-wrap gap-2">
                {opp.contactPhone ? (
                  <a href={`tel:${opp.contactPhone}`} className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-[10px] font-black uppercase text-white">
                    <Phone className="h-3 w-3" /> Call
                  </a>
                ) : null}
                {opp.contactPhone ? (
                  <button type="button" onClick={() => previewSend('sms', 'sms_pitch')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase text-black">
                    <MessageSquare className="h-3 w-3" /> SMS
                  </button>
                ) : null}
                {opp.contactEmail ? (
                  <button type="button" onClick={() => previewSend('email', 'email_pitch')} className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-white">
                    <Mail className="h-3 w-3" /> Email
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(scripts.sms_pitch);
                    setMsg('Pitch copied.');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft"
                >
                  <Copy className="h-3 w-3" /> Copy pitch
                </button>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-white/8 pt-4">
                <button type="button" disabled={pending} onClick={() => act(() => seedOpportunityAction(opp.id), 'Seeded as warm lead')} className="rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50">
                  Seed warm lead
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'quoted'), 'Marked quoted')} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50">
                  Quoted
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'booked'), 'Marked booked')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200 disabled:opacity-50">
                  Booked
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => snoozeOpportunityAction(opp.id), 'Snoozed 60 days')} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400 disabled:opacity-50">
                  Snooze
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => scheduleFollowUpAction(opp.id, '2days'), 'Follow-up scheduled')} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">
                  <Calendar className="h-3 w-3" /> Schedule follow-up
                </button>
              </div>

              <div className="rounded-xl border border-white/8 p-3">
                <p className="text-[10px] font-black uppercase text-zinc-500">Add note</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-xs text-white" placeholder="Call outcome, gatekeeper name, etc." />
                <button type="button" disabled={!note.trim() || pending} onClick={() => act(() => addOpportunityNoteAction(opp.id, note.trim()), 'Note saved')} className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50">
                  Save note
                </button>
              </div>

              {events.length > 0 ? (
                <ul className="space-y-1 border-t border-white/8 pt-3">
                  {events.map((e) => (
                    <li key={e.id} className="text-[10px] text-zinc-500">
                      {new Date(e.createdAt).toLocaleString()} — <span className="text-emerald-300">{e.eventType}</span>
                      {e.notes ? `: ${e.notes}` : ''}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {tab === 'scripts' ? (
            <div className="space-y-3">
              {(Object.keys(SCRIPT_LABELS) as OpportunityScriptKey[]).map((key) => (
                <div key={key} className="rounded-xl border border-white/8 bg-black/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase text-gold-soft">{SCRIPT_LABELS[key]}</p>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { void navigator.clipboard.writeText(scripts[key]); setMsg('Copied.'); }} className="rounded px-2 py-1 text-[9px] font-bold uppercase text-zinc-400 hover:text-white">
                        Copy
                      </button>
                      {key.includes('sms') || key === 'follow_up_no_response' ? (
                        <button type="button" disabled={!opp.contactPhone} onClick={() => previewSend('sms', key)} className="rounded bg-emerald-500/20 px-2 py-1 text-[9px] font-bold uppercase text-emerald-200 disabled:opacity-40">
                          Preview SMS
                        </button>
                      ) : null}
                      {key.includes('email') || key === 'quote_intro' ? (
                        <button type="button" disabled={!opp.contactEmail} onClick={() => previewSend('email', key)} className="rounded bg-cyan-500/20 px-2 py-1 text-[9px] font-bold uppercase text-cyan-200 disabled:opacity-40">
                          Preview email
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{scripts[key]}</p>
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'quote' ? (
            <div className="space-y-4">
              {isFleet ? (
                <FleetQuoteWizard
                  opportunityId={opp.id}
                  businessName={ext.businessName ?? opp.title}
                  contactName={opp.contactName ?? undefined}
                  contactEmail={opp.contactEmail}
                  contactPhone={opp.contactPhone}
                  serviceOptions={serviceOptions}
                />
              ) : serviceOptions.length > 0 ? (
                <QuoteBuilderPanel
                  opportunityId={opp.id}
                  contactName={opp.contactName ?? undefined}
                  leadEmail={opp.contactEmail}
                  leadPhone={opp.contactPhone}
                  estimates={[]}
                  serviceOptions={serviceOptions}
                  contextLabel={`Opportunity · ${opp.title}`}
                />
              ) : (
                <p className="text-sm text-zinc-500">No services loaded for quoting.</p>
              )}
            </div>
          ) : null}
        </div>

        {msg ? <p className="shrink-0 border-t border-white/8 px-5 py-3 text-xs text-emerald-200">{msg}</p> : null}
      </div>
    </div>
  );
}
