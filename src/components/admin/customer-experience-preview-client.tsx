'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { repairCustomerAccountLinkageAction } from '@/app/(dashboard)/admin/customer-preview/[id]/actions';
import type {
  CustomerExperienceDiagnostics,
  DiagnosticCheck,
} from '@/lib/customer-experience-diagnostics';
import { useToast } from '@/components/ui/toast-provider';

function money(value: number) {
  return `$${(value / 100).toFixed(2)}`;
}

function when(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function checkIcon(status: DiagnosticCheck['status']) {
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-300" />;
  if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-300" />;
  return <XCircle className="h-4 w-4 text-rose-300" />;
}

export function CustomerExperiencePreviewClient({
  diagnostics,
}: {
  diagnostics: CustomerExperienceDiagnostics;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<'view' | 'diagnostics' | 'timeline'>('view');
  const [simulation, setSimulation] = useState(false);
  const [simAcknowledged, setSimAcknowledged] = useState(diagnostics.summary.acknowledgementCompleted);
  const [simPaid, setSimPaid] = useState(diagnostics.summary.depositPaidCents >= diagnostics.summary.depositCents);
  const [simAccount, setSimAccount] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(diagnostics.portalUrl);
      toast.success('Copied', 'Active customer link copied without changing tracking.');
    } catch {
      toast.error('Copy failed', 'The active link could not be copied.');
    }
  };

  const repairAccount = () => {
    startTransition(async () => {
      const result = await repairCustomerAccountLinkageAction(diagnostics.appointmentId);
      if (result.error) toast.error('Repair stopped', result.error);
      else {
        toast.success('Customer linkage repaired', result.message ?? 'Safe repair completed.');
        router.refresh();
      }
    });
  };

  const simNext = !simAcknowledged
    ? 'Acknowledgement'
    : diagnostics.summary.depositCents > 0 && !simPaid
      ? 'Payment'
      : 'Confirmation';

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/85 p-2 backdrop-blur-sm sm:p-5">
      <section className="mx-auto min-h-[calc(100vh-1rem)] max-w-7xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl sm:min-h-[calc(100vh-2.5rem)]">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-zinc-950/95 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sky-200">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-xs font-black uppercase tracking-[0.18em]">Admin preview</p>
              </div>
              <p className="mt-1 text-sm text-zinc-400">No customer activity will be recorded.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSimulation((value) => !value);
                  setTab('view');
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-bold text-violet-100"
              >
                <FlaskConical className="h-4 w-4" />
                {simulation ? 'Exit simulation' : 'Test interactive flow'}
              </button>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200"
              >
                <Copy className="h-4 w-4" /> Copy customer link
              </button>
              <a
                href={diagnostics.customerViewUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-zinc-200"
              >
                <ExternalLink className="h-4 w-4" /> Private preview window
              </a>
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 text-zinc-300"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto">
            {([
              ['view', 'Customer view'],
              ['diagnostics', 'Diagnostics'],
              ['timeline', 'Timeline'],
            ] as const).map(([key, label]) => (
              <button
                type="button"
                key={key}
                onClick={() => setTab(key)}
                className={`shrink-0 rounded-xl px-4 py-2 text-xs font-black uppercase ${
                  tab === key ? 'bg-gold text-black' : 'border border-white/10 text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
            <span
              className={`ml-auto shrink-0 rounded-full border px-3 py-2 text-[10px] font-black uppercase ${
                diagnostics.overall === 'Valid'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : diagnostics.overall === 'Recoverable'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              }`}
            >
              {diagnostics.overall}
            </span>
          </nav>
        </header>

        {tab === 'view' ? (
          <div className="p-3 sm:p-6">
            {simulation ? (
              <div className="mx-auto max-w-2xl space-y-5 rounded-3xl border border-violet-400/30 bg-violet-950/20 p-5 sm:p-8">
                <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4 text-sm text-violet-100">
                  Isolated browser simulation — these controls write nothing to the customer, booking, payment, account, or rewards data.
                </div>
                <div className="rounded-3xl border border-white/10 bg-black/50 p-6 text-center">
                  <p className="text-xs font-black uppercase tracking-widest text-gold-soft">Simulated next step</p>
                  <p className="mt-3 text-3xl font-black text-white">{simNext}</p>
                  <p className="mt-2 text-sm text-zinc-400">
                    {money(diagnostics.summary.finalTotalCents)} total · {money(diagnostics.summary.depositCents)} deposit
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={() => setSimAcknowledged(true)} className="rounded-2xl bg-gold px-4 py-4 text-xs font-black uppercase text-black">
                    Simulate sign
                  </button>
                  <button type="button" onClick={() => setSimPaid(true)} className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-4 text-xs font-black uppercase text-emerald-100">
                    Simulate deposit
                  </button>
                  <button type="button" onClick={() => setSimAccount(true)} className="rounded-2xl border border-sky-400/40 bg-sky-500/10 px-4 py-4 text-xs font-black uppercase text-sky-100">
                    Simulate account
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-300">Acknowledgement: {simAcknowledged ? 'Complete' : 'Required'}</div>
                  <div className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-300">Deposit: {simPaid ? 'Paid' : 'Due'}</div>
                  <div className="rounded-2xl border border-white/10 p-4 text-sm text-zinc-300">Account: {simAccount ? 'Claimed' : 'Optional'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSimAcknowledged(diagnostics.summary.acknowledgementCompleted);
                    setSimPaid(diagnostics.summary.depositPaidCents >= diagnostics.summary.depositCents);
                    setSimAccount(false);
                  }}
                  className="w-full rounded-xl border border-white/15 px-4 py-3 text-xs font-bold uppercase text-zinc-300"
                >
                  Reset simulation
                </button>
              </div>
            ) : diagnostics.customerViewUrl ? (
              <iframe
                title="Exact customer confirmation preview"
                src={diagnostics.customerViewUrl}
                className="h-[calc(100vh-13rem)] min-h-[680px] w-full rounded-2xl border border-white/10 bg-black"
              />
            ) : (
              <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-100">
                A secure token is required before the customer view can load.
              </p>
            )}
          </div>
        ) : null}

        {tab === 'diagnostics' ? (
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-white">Canonical link verification</h2>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => router.refresh()}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-zinc-300"
                >
                  <RefreshCw className={`h-4 w-4 ${pending ? 'animate-spin' : ''}`} /> Verify again
                </button>
              </div>
              {diagnostics.checks.map((check) => (
                <div key={check.key} className="flex gap-3 rounded-2xl border border-white/10 bg-black/35 p-4">
                  {checkIcon(check.status)}
                  <div>
                    <p className="text-sm font-bold text-white">{check.label}</p>
                    <p className="mt-1 text-xs text-zinc-400">{check.detail}</p>
                  </div>
                </div>
              ))}
              {diagnostics.canSafeRepairAccount ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={repairAccount}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-5 py-4 text-sm font-black uppercase text-white disabled:opacity-50"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  Safely remove staff account contamination
                </button>
              ) : null}
            </div>

            <div className="space-y-5">
              <section className="rounded-3xl border border-gold/20 bg-gold/5 p-5">
                <h2 className="text-xs font-black uppercase tracking-widest text-gold-soft">Current customer state</h2>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-zinc-500">Appointment</dt><dd className="font-bold text-white">{when(diagnostics.summary.scheduledStart)}</dd></div>
                  <div><dt className="text-zinc-500">Next step</dt><dd className="font-bold capitalize text-white">{diagnostics.summary.nextStep}</dd></div>
                  <div><dt className="text-zinc-500">Total</dt><dd className="font-bold text-white">{money(diagnostics.summary.finalTotalCents)}</dd></div>
                  <div><dt className="text-zinc-500">Discount</dt><dd className="font-bold text-emerald-300">{money(diagnostics.summary.discountCents)}</dd></div>
                  <div><dt className="text-zinc-500">Deposit</dt><dd className="font-bold text-amber-200">{money(diagnostics.summary.depositCents)}</dd></div>
                  <div><dt className="text-zinc-500">Paid</dt><dd className="font-bold text-white">{money(diagnostics.summary.totalPaidCents)}</dd></div>
                </dl>
              </section>

              <section className="rounded-3xl border border-white/10 bg-black/35 p-5">
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-300">Portal tracking</h2>
                <dl className="mt-4 space-y-2 text-xs text-zinc-400">
                  <div className="flex justify-between gap-3"><dt>Link created</dt><dd>{when(diagnostics.tracking.createdAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Last regenerated</dt><dd>{when(diagnostics.tracking.regeneratedAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Message last sent</dt><dd>{when(diagnostics.tracking.lastSentAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Customer first opened</dt><dd>{when(diagnostics.tracking.firstOpenedAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Customer last opened</dt><dd>{when(diagnostics.tracking.lastOpenedAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Counted opens</dt><dd>{diagnostics.tracking.openCount}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Acknowledgement started</dt><dd>{when(diagnostics.tracking.acknowledgementStartedAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Payment page opened</dt><dd>{when(diagnostics.tracking.paymentPageOpenedAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Account claim started</dt><dd>{when(diagnostics.tracking.accountClaimStartedAt)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Account created</dt><dd>{when(diagnostics.tracking.accountCreatedAt)}</dd></div>
                </dl>
              </section>

              <section className="rounded-3xl border border-white/10 bg-black/35 p-5">
                <h2 className="text-xs font-black uppercase tracking-widest text-zinc-300">Rewards linkage</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl border border-white/10 p-3"><p className="text-xl font-black text-white">{diagnostics.rewards.loyaltyPunches}</p><p className="text-[10px] uppercase text-zinc-500">Punches</p></div>
                  <div className="rounded-xl border border-white/10 p-3"><p className="text-xl font-black text-white">{diagnostics.rewards.activeCredits}</p><p className="text-[10px] uppercase text-zinc-500">Active credits</p></div>
                  <div className="rounded-xl border border-white/10 p-3"><p className="text-xl font-black text-white">{diagnostics.rewards.reservedRewards}</p><p className="text-[10px] uppercase text-zinc-500">Available/reserved</p></div>
                  <div className="rounded-xl border border-white/10 p-3"><p className="text-xl font-black text-white">{diagnostics.rewards.redeemedRewards}</p><p className="text-[10px] uppercase text-zinc-500">Redeemed</p></div>
                </div>
                <p className="mt-3 text-xs text-zinc-400">Referral code: {diagnostics.rewards.referralCodeReady ? 'Ready' : 'Not yet created'}</p>
              </section>
            </div>
          </div>
        ) : null}

        {tab === 'timeline' ? (
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap gap-2 text-[10px] font-black uppercase">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-emerald-200">Real customer</span>
              <span className="rounded-full bg-sky-500/10 px-3 py-1.5 text-sky-200">Owner preview</span>
              <span className="rounded-full bg-amber-500/10 px-3 py-1.5 text-amber-200">Automated excluded</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-zinc-300">System delivery</span>
            </div>
            <div className="space-y-2">
              {diagnostics.timeline.length ? diagnostics.timeline.map((event) => (
                <div key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/35 p-4">
                  <div>
                    <p className="text-sm font-bold capitalize text-white">{event.label}</p>
                    <p className="mt-1 text-xs text-zinc-500">{when(event.at)}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                    event.bucket === 'customer' ? 'bg-emerald-500/10 text-emerald-200'
                      : event.bucket === 'admin' ? 'bg-sky-500/10 text-sky-200'
                        : event.bucket === 'automated' ? 'bg-amber-500/10 text-amber-200'
                          : 'bg-white/10 text-zinc-300'
                  }`}>
                    {event.bucket}{event.counted ? '' : ' · excluded'}
                  </span>
                </div>
              )) : (
                <p className="rounded-2xl border border-white/10 p-5 text-sm text-zinc-400">No portal events have been recorded yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
