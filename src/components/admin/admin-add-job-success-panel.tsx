'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Mail, MessageSquare, Plus } from 'lucide-react';
import type { CreateAdminJobResult } from '@/lib/admin/create-admin-job-result';
import {
  resendBookingConfirmationEmailAction,
  resendBookingConfirmationSmsAction,
  getCustomerPortalLinkAction,
} from '@/app/(dashboard)/admin/confirmation-actions';
import { useToast } from '@/components/ui/toast-provider';

function statusLabel(v?: string) {
  if (!v || v === 'skipped') return { text: 'Skipped', className: 'text-zinc-500' };
  if (v === 'ok' || v === 'sent' || v === 'delivered' || v === 'synced' || v === 'matched' || v === 'created') {
    return { text: v === 'matched' ? 'Matched existing' : v === 'created' ? 'Created' : 'OK', className: 'text-emerald-300' };
  }
  if (v === 'failed') return { text: 'Failed', className: 'text-rose-300' };
  if (v === 'pending') return { text: 'Pending', className: 'text-amber-200' };
  return { text: v, className: 'text-zinc-300' };
}

function Row({ label, value }: { label: string; value?: string }) {
  const s = statusLabel(value);
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-semibold uppercase text-[11px] tracking-wide ${s.className}`}>{s.text}</span>
    </div>
  );
}

export function AdminAddJobSuccessPanel({
  result,
  onAddAnother,
}: {
  result: CreateAdminJobResult;
  onAddAnother: () => void;
}) {
  const toast = useToast();
  const [portalUrl, setPortalUrl] = useState(result.portalUrl ?? result.customerConfirmation?.portalUrl ?? '');

  const copyPortal = async () => {
    let url = portalUrl;
    if (!url && result.appointmentId) {
      const res = await getCustomerPortalLinkAction(result.appointmentId);
      if (res.portalUrl) {
        url = res.portalUrl;
        setPortalUrl(url);
      }
    }
    if (!url) {
      toast.error('Portal link', 'Could not load portal link.');
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('Copied', 'Customer portal link copied.');
  };

  const resendEmail = async () => {
    if (!result.appointmentId) return;
    const res = await resendBookingConfirmationEmailAction(result.appointmentId);
    if (res.error) toast.error('Email', res.error);
    else toast.success('Email', res.message ?? 'Sent.');
  };

  const resendSms = async () => {
    if (!result.appointmentId) return;
    const res = await resendBookingConfirmationSmsAction(result.appointmentId);
    if (res.error) toast.error('SMS', res.error);
    else toast.success('SMS', res.message ?? 'Sent.');
  };

  return (
    <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-300" />
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">Job saved</p>
          <h2 className="mt-1 text-2xl font-black text-white">Work order created</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Appointment <code className="text-gold-soft">{result.appointmentId?.slice(0, 8)}…</code>
            {result.customerId ? ` · Customer linked` : ''}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-4">
        <Row label="Customer" value={result.customerStatus} />
        <Row label="Work order / appointment" value="ok" />
        <Row label="Calendar block" value={result.calendarBlockStatus} />
        <Row label="Google Calendar" value={result.googleCalendarStatus} />
        <Row label="Owner notify (email/SMS/Pushover)" value={result.ownerNotificationStatus} />
        <Row label="Customer email" value={String(result.customerConfirmation?.email ?? 'skipped')} />
        <Row label="Customer SMS" value={String(result.customerConfirmation?.sms ?? 'skipped')} />
        <Row label="Payment record" value={result.paymentStatus} />
        <Row label="Vehicle CRM sync" value={result.vehicleStatus} />
      </div>

      {result.warnings.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-bold uppercase tracking-wider">Warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {result.appointmentId ? (
          <Link
            href={`/admin/work-orders/${result.appointmentId}?shell=admin`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open work order
          </Link>
        ) : null}
        <button type="button" onClick={resendEmail} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-bold uppercase text-zinc-300">
          <Mail className="h-3.5 w-3.5" /> Resend email
        </button>
        <button type="button" onClick={resendSms} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-bold uppercase text-zinc-300">
          <MessageSquare className="h-3.5 w-3.5" /> Resend SMS
        </button>
        <button type="button" onClick={copyPortal} className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 px-4 py-2.5 text-[10px] font-bold uppercase text-gold-soft">
          <Copy className="h-3.5 w-3.5" /> Copy portal link
        </button>
        <Link href="/admin/calendar" className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-bold uppercase text-zinc-300">
          View calendar
        </Link>
        <button type="button" onClick={onAddAnother} className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-bold uppercase text-zinc-300">
          <Plus className="h-3.5 w-3.5" /> Add another job
        </button>
      </div>
    </section>
  );
}
