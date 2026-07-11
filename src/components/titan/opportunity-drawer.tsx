'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Copy, ExternalLink, Mail, MapPin, MessageSquare, Phone, X } from 'lucide-react';
import type { RevenueOpportunity, RevenueOpportunityEvent } from '@/lib/titan/revenue-opportunities';
import { OPPORTUNITY_TYPE_LABELS, STATUS_LABELS } from '@/lib/titan/revenue-opportunities';
import { displayMoney } from '@/lib/display-format';
import {
  addOpportunityNoteAction,
  logOpportunityCallAction,
  markOpportunityStatusAction,
  scheduleFollowUpAction,
  seedOpportunityAction,
  snoozeOpportunityAction,
  updateOpportunityContactAction,
} from '@/app/(dashboard)/admin/titan/opportunity-actions';
import { sendPreviewedEmailAction, sendPreviewedSmsAction } from '@/app/(dashboard)/admin/outbound-message-actions';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildOpportunityScripts, explainOpportunityValue, type OpportunityScriptKey } from '@/lib/opportunity-pipeline-scripts';
import { brandingToScriptContext, type ScriptBranding } from '@/lib/titan/script-branding-types';
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
  scriptBranding,
  onClose,
}: {
  opp: RevenueOpportunity;
  events: RevenueOpportunityEvent[];
  serviceOptions: { slug: string; title: string; priceCents?: number; durationMinutes?: number }[];
  scriptBranding?: ScriptBranding | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'profile' | 'scripts' | 'quote'>('profile');
  const [msg, setMsg] = useState<string | null>(null);
  const [editContact, setEditContact] = useState(false);
  const [contactNameDraft, setContactNameDraft] = useState(opp.contactName ?? '');
  const [contactPhoneDraft, setContactPhoneDraft] = useState(opp.contactPhone ?? '');
  const [contactEmailDraft, setContactEmailDraft] = useState(opp.contactEmail ?? '');

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
      buildOpportunityScripts(
        opp,
        brandingToScriptContext(scriptBranding, {
          businessName: ext.businessName ?? opp.title,
          category: ext.businessCategory ?? String(opp.opportunityType),
          contactName: opp.contactName,
          vehicleCount: ext.estimatedVehicleCount ?? null,
          address: ext.businessAddress ?? null,
          estimatedValue: displayMoney(opp.estimatedRevenueCents),
        }),
      ),
    [opp, ext, scriptBranding],
  );

  const mapsUrl = ext.businessAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ext.businessAddress)}`
    : null;

  const contactName = opp.contactName?.trim() || null;
  const valueExplain = ext.valueExplanation || explainOpportunityValue(opp);
  const isFleet = ['fleet', 'dealership', 'apartment_hoa', 'google_places'].includes(String(opp.opportunityType));

  const act = (fn: () => Promise<{ ok?: boolean; error?: string; projectId?: string }>, success: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setMsg(res.error);
      else {
        setMsg(res.projectId ? `${success} · Project ${res.projectId.slice(0, 8)}… created` : success);
        router.refresh();
      }
    });
  };

  const logCall = (outcome?: string) => {
    act(() => logOpportunityCallAction(opp.id, outcome), 'Call logged.');
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
    <div className="fixed inset-0 z-[200] flex justify-end bg-background/60 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="flex h-full w-full max-w-xl flex-col border-l border-border bg-card text-foreground shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">
              {OPPORTUNITY_TYPE_LABELS[opp.opportunityType] ?? opp.opportunityType}
            </p>
            <h2 className="mt-1 text-xl font-black text-foreground">{ext.businessName ?? opp.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {STATUS_LABELS[opp.status as keyof typeof STATUS_LABELS] ?? opp.status} · Source: {opp.source}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex shrink-0 gap-1 border-b border-border px-5 py-2">
          {(['profile', 'scripts', 'quote'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase ${tab === t ? 'bg-gold text-black' : 'text-muted-foreground'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {tab === 'profile' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/8 p-4">
                <p className="text-[10px] font-black uppercase text-cyan-700">Estimated value</p>
                <p className="mt-1 font-mono text-2xl font-black text-foreground">{displayMoney(opp.estimatedRevenueCents)}</p>
                <p className="mt-2 text-xs text-muted-foreground">{valueExplain}</p>
              </div>

              <dl className="space-y-2 text-sm">
                {editContact ? (
                  <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-[10px] font-black uppercase text-muted-foreground">Edit contact</p>
                    <input
                      value={contactNameDraft}
                      onChange={(e) => setContactNameDraft(e.target.value)}
                      placeholder="Name"
                      className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
                    />
                    <input
                      value={contactPhoneDraft}
                      onChange={(e) => setContactPhoneDraft(e.target.value)}
                      placeholder="Phone"
                      className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
                    />
                    <input
                      value={contactEmailDraft}
                      onChange={(e) => setContactEmailDraft(e.target.value)}
                      placeholder="Email"
                      className="w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(
                            () =>
                              updateOpportunityContactAction(opp.id, {
                                contactName: contactNameDraft,
                                contactPhone: contactPhoneDraft,
                                contactEmail: contactEmailDraft,
                              }),
                            'Contact saved',
                          )
                        }
                        className="rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
                      >
                        Save contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditContact(false)}
                        className="rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase text-muted-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase text-muted-foreground">Contact</p>
                      <button
                        type="button"
                        onClick={() => {
                          setContactNameDraft(opp.contactName ?? '');
                          setContactPhoneDraft(opp.contactPhone ?? '');
                          setContactEmailDraft(opp.contactEmail ?? '');
                          setEditContact(true);
                        }}
                        className="text-[10px] font-black uppercase text-gold-soft hover:underline"
                      >
                        {contactName || opp.contactPhone || opp.contactEmail ? 'Edit' : 'Add contact'}
                      </button>
                    </div>
                    {contactName ? (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">Name</dt>
                        <dd className="text-foreground">{contactName}</dd>
                      </div>
                    ) : null}
                    {opp.contactPhone ? (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">Phone</dt>
                        <dd>
                          <a href={`tel:${opp.contactPhone}`} className="text-emerald-600 hover:underline">{opp.contactPhone}</a>
                        </dd>
                      </div>
                    ) : null}
                    {opp.contactEmail ? (
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-muted-foreground">Email</dt>
                        <dd>
                          <a href={`mailto:${opp.contactEmail}`} className="text-emerald-600 hover:underline">{opp.contactEmail}</a>
                        </dd>
                      </div>
                    ) : null}
                    {!contactName && !opp.contactPhone && !opp.contactEmail ? (
                      <p className="text-xs text-muted-foreground">No contact on file — add a phone or email to send outreach.</p>
                    ) : null}
                  </>
                )}
                {ext.businessAddress ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Address</dt>
                    <dd className="text-foreground">{ext.businessAddress}</dd>
                  </div>
                ) : null}
                {mapsUrl ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Maps</dt>
                    <dd>
                      <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                        <MapPin className="h-3 w-3" /> Open in Google Maps
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    </dd>
                  </div>
                ) : null}
                {ext.websiteUrl ? (
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">Website</dt>
                    <dd>
                      <a href={ext.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                        {ext.websiteUrl.replace(/^https?:\/\//, '')}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </a>
                    </dd>
                  </div>
                ) : null}
                {ext.estimatedVehicleCount ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Vehicles</dt>
                    <dd className="text-foreground">~{ext.estimatedVehicleCount}</dd>
                  </div>
                ) : null}
                {ext.distanceMiles != null ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Distance</dt>
                    <dd className="text-foreground">{ext.distanceMiles} mi</dd>
                  </div>
                ) : null}
              </dl>

              <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                <span className="font-black text-gold-soft">Why Titan thinks it fits: </span>
                {opp.whySurfaced}
              </p>

              {opp.notes ? <p className="text-xs text-muted-foreground">{opp.notes}</p> : null}

              <div className="flex flex-wrap gap-2">
                {opp.contactPhone ? (
                  <a
                    href={`tel:${opp.contactPhone}`}
                    onClick={() => logCall()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[10px] font-black uppercase text-foreground"
                  >
                    <Phone className="h-3 w-3" /> Call & log
                  </a>
                ) : null}
                {opp.contactPhone ? (
                  <button type="button" onClick={() => previewSend('sms', 'sms_pitch')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-2 text-[10px] font-black uppercase text-black">
                    <MessageSquare className="h-3 w-3" /> SMS
                  </button>
                ) : null}
                {opp.contactEmail ? (
                  <button type="button" onClick={() => previewSend('email', 'email_pitch')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase text-foreground">
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

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <button type="button" disabled={pending} onClick={() => act(() => seedOpportunityAction(opp.id), 'Seeded as warm lead')} className="rounded-lg bg-gold px-3 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50">
                  Seed warm lead
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'quoted'), 'Marked quoted')} className="rounded-lg border border-cyan-500/30 px-3 py-2 text-[10px] font-black uppercase text-cyan-700 disabled:opacity-50">
                  Quoted
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => markOpportunityStatusAction(opp.id, 'booked'), 'Marked booked')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 disabled:opacity-50">
                  Booked
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => snoozeOpportunityAction(opp.id), 'Snoozed 60 days')} className="rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase text-muted-foreground disabled:opacity-50">
                  Snooze
                </button>
                <button type="button" disabled={pending} onClick={() => act(() => scheduleFollowUpAction(opp.id, '2days'), 'Follow-up scheduled')} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-[10px] font-black uppercase text-foreground disabled:opacity-50">
                  <Calendar className="h-3 w-3" /> Schedule follow-up
                </button>
              </div>

              <div className="rounded-xl border border-border p-3">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Add note</p>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-2 w-full rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground" placeholder="Call outcome, gatekeeper name, etc." />
                <button type="button" disabled={!note.trim() || pending} onClick={() => act(() => addOpportunityNoteAction(opp.id, note.trim()), 'Note saved')} className="mt-2 rounded-lg bg-muted px-3 py-2 text-[10px] font-black uppercase text-foreground disabled:opacity-50">
                  Save note
                </button>
              </div>

              {events.length > 0 ? (
                <ul className="space-y-1 border-t border-border pt-3">
                  {events.map((e) => (
                    <li key={e.id} className="text-[10px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()} — <span className="text-emerald-600">{e.eventType}</span>
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
                <div key={key} className="rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-black uppercase text-gold-soft">{SCRIPT_LABELS[key]}</p>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => { void navigator.clipboard.writeText(scripts[key]); setMsg('Copied.'); }} className="rounded px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-foreground">
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
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{scripts[key]}</p>
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
                <p className="text-sm text-muted-foreground">No services loaded for quoting.</p>
              )}
            </div>
          ) : null}
        </div>

        {msg ? <p className="shrink-0 border-t border-border px-5 py-3 text-xs text-emerald-700">{msg}</p> : null}
      </div>
    </div>
  );
}
