'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, Mail, MessageSquare, RefreshCw, Send, XCircle } from 'lucide-react';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import {
  getCustomerPortalLinkAction,
  getConfirmationDeliveryStatusAction,
  previewBookingConfirmationAction,
  resendBookingConfirmationEmailAction,
  resendBookingConfirmationSmsAction,
  sendBookingConfirmationAction,
  sendBookingConfirmationBothAction,
} from '@/app/(dashboard)/admin/confirmation-actions';
import { useToast } from '@/components/ui/toast-provider';
import type { ConfirmationDeliveryStatus, DeliveryChannelStatus } from '@/lib/confirmation-delivery-status';

function statusBadge(status: DeliveryChannelStatus) {
  const map: Record<DeliveryChannelStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    sent: { label: 'Sent', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', icon: CheckCircle2 },
    failed: { label: 'Failed', className: 'border-rose-500/30 bg-rose-500/10 text-rose-200', icon: XCircle },
    skipped: { label: 'Skipped', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200', icon: AlertTriangle },
    not_sent: { label: 'Not sent', className: 'border-white/10 bg-white/5 text-zinc-400', icon: MessageSquare },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${s.className}`}>
      <Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function WorkOrderConfirmationPanel({
  appointmentId,
  guestName,
  guestEmail,
  guestPhone,
  customerId,
  initialStatus,
}: {
  appointmentId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  customerId?: string | null;
  initialStatus?: ConfirmationDeliveryStatus | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ConfirmationDeliveryStatus | null>(initialStatus ?? null);
  const [portalUrl, setPortalUrl] = useState<string | null>(initialStatus?.portalUrl ?? null);

  const refreshStatus = () => {
    startTransition(async () => {
      const res = await getConfirmationDeliveryStatusAction(appointmentId);
      if (res.status) {
        setStatus(res.status);
        if (res.status.portalUrl) setPortalUrl(res.status.portalUrl);
      }
    });
  };

  const previewConfirmation = () => {
    startTransition(async () => {
      const preview = await previewBookingConfirmationAction(appointmentId);
      if (preview.error || !preview.smsBody) {
        toast.error('Confirmation', preview.error ?? 'Could not build confirmation.');
        return;
      }
      if (preview.portalUrl) setPortalUrl(preview.portalUrl);
      openPreview({
        title: 'Preview customer confirmation',
        channel: 'sms',
        recipient: guestPhone || guestEmail || guestName,
        subject: preview.emailSubject ?? 'Gloss Boss ATX — Your appointment is confirmed',
        body: preview.smsBody,
        contextLabel: [guestName, preview.whenLabel, preview.service].filter(Boolean).join(' · '),
        onSend: async () => ({ ok: true }),
      });
    });
  };

  const sendBoth = () => {
    startTransition(async () => {
      const preview = await previewBookingConfirmationAction(appointmentId);
      if (preview.error) {
        toast.error('Confirmation', preview.error);
        return;
      }
      if (preview.portalUrl) setPortalUrl(preview.portalUrl);
      openPreview({
        title: 'Send customer confirmation',
        channel: guestPhone ? 'sms' : 'email',
        recipient: guestPhone || guestEmail || 'No contact on file',
        subject: preview.emailSubject ?? 'Gloss Boss ATX — Your appointment is confirmed',
        body: preview.smsBody ?? '',
        contextLabel: [guestName, preview.whenLabel, preview.service].filter(Boolean).join(' · '),
        onSend: async (final) => {
          const res = await sendBookingConfirmationAction({
            appointmentId,
            customSmsBody: final.body,
            customEmailSubject: final.subject,
          });
          if (res.error) {
            toast.error('Confirmation failed', res.error);
            return { ok: false, error: res.error };
          }
          if (res.tone === 'warning') toast.warning('Confirmation', res.message ?? 'Sent with warnings.');
          else toast.success('Confirmation sent', res.message ?? 'Customer notified.');
          refreshStatus();
          router.refresh();
          return { ok: true };
        },
      });
    });
  };

  const resendEmail = () => {
    startTransition(async () => {
      const res = await resendBookingConfirmationEmailAction(appointmentId);
      if (res.error) toast.error('Email', res.error);
      else toast.success('Email', res.message ?? 'Confirmation email sent.');
      refreshStatus();
      router.refresh();
    });
  };

  const resendSms = () => {
    startTransition(async () => {
      const res = await resendBookingConfirmationSmsAction(appointmentId);
      if (res.error) toast.error('SMS', res.error);
      else toast.success('SMS', res.message ?? 'Confirmation SMS sent.');
      refreshStatus();
      router.refresh();
    });
  };

  const sendBothDirect = () => {
    startTransition(async () => {
      const res = await sendBookingConfirmationBothAction(appointmentId);
      if (res.error) toast.error('Confirmation', res.error);
      else toast.success('Confirmation', res.message ?? 'Sent.');
      refreshStatus();
      router.refresh();
    });
  };

  const copyPortalLink = () => {
    startTransition(async () => {
      let url = portalUrl;
      if (!url) {
        const res = await getCustomerPortalLinkAction(appointmentId);
        if (res.error || !res.portalUrl) {
          toast.error('Portal link', res.error ?? 'Could not load portal link.');
          return;
        }
        url = res.portalUrl;
        setPortalUrl(url);
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Copied', 'Customer portal link copied.');
        refreshStatus();
      } catch {
        toast.error('Copy failed', url);
      }
    });
  };

  const missingContact = !guestEmail && !guestPhone;

  return (
    <div className="rounded-2xl border border-gold/25 bg-gradient-to-br from-black/60 to-zinc-950/80 p-5 shadow-[0_0_32px_rgba(212,175,55,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Customer confirmation</p>
          <p className="mt-1 text-xs text-zinc-400">
            Branded email + SMS with secure portal link — appointment, photos, loyalty, and referral access.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={refreshStatus}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-bold uppercase text-zinc-400 hover:text-white"
        >
          <RefreshCw className={`h-3 w-3 ${pending ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {missingContact ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p className="font-bold">Missing customer contact</p>
          <p className="mt-1 text-amber-200/80">Add email or phone before sending confirmation.</p>
          {customerId ? (
            <Link
              href={`/admin/customers/${customerId}`}
              className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft underline"
            >
              Edit customer <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/8 bg-black/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase text-zinc-500">Email</span>
              {statusBadge(status?.email.status ?? 'not_sent')}
            </div>
            <p className="mt-2 truncate text-xs text-zinc-300">{guestEmail || '—'}</p>
            <p className="mt-1 text-[10px] text-zinc-500">Last sent: {formatWhen(status?.email.lastSentAt ?? null)}</p>
            {status?.email.providerMessageId ? (
              <p className="mt-0.5 truncate text-[10px] text-zinc-600">ID: {status.email.providerMessageId}</p>
            ) : null}
            {status?.email.lastError ? <p className="mt-1 text-[10px] text-rose-300">{status.email.lastError}</p> : null}
          </div>
          <div className="rounded-xl border border-white/8 bg-black/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase text-zinc-500">SMS</span>
              {statusBadge(status?.sms.status ?? 'not_sent')}
            </div>
            <p className="mt-2 truncate text-xs text-zinc-300">{guestPhone || '—'}</p>
            <p className="mt-1 text-[10px] text-zinc-500">Last sent: {formatWhen(status?.sms.lastSentAt ?? null)}</p>
            {status?.sms.providerMessageId ? (
              <p className="mt-0.5 truncate text-[10px] text-zinc-600">Twilio SID: {status.sms.providerMessageId}</p>
            ) : null}
            {status?.sms.twilioDetail ? <p className="mt-1 text-[10px] text-zinc-400">{status.sms.twilioDetail}</p> : null}
            {status?.sms.lastError ? <p className="mt-1 text-[10px] text-rose-300">{status.sms.lastError}</p> : null}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-gold/15 bg-gold/5 p-3">
        <p className="text-[9px] font-black uppercase tracking-wider text-gold-soft">Portal link tracking</p>
        <div className="mt-2 grid gap-1 text-[10px] text-zinc-400 sm:grid-cols-2">
          <p>Created: {formatWhen(status?.portal.linkCreatedAt ?? null)}</p>
          <p>Last sent: {formatWhen(status?.portal.linkLastSentAt ?? null)}</p>
          <p>Customer opened: {formatWhen(status?.portal.linkLastOpenedAt ?? null)}</p>
          <p>Account linked: {status?.portal.authUserLinked ? 'Yes' : 'No'}</p>
        </div>
        {(portalUrl || status?.portalUrl) ? (
          <p className="mt-2 truncate font-mono text-[10px] text-zinc-500">{portalUrl || status?.portalUrl}</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={previewConfirmation}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-bold uppercase text-zinc-300 disabled:opacity-50"
        >
          Preview confirmation
        </button>
        <button
          type="button"
          disabled={pending || !guestEmail}
          onClick={resendEmail}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-bold uppercase text-zinc-300 disabled:opacity-50"
        >
          <Mail className="h-3 w-3" /> Send email
        </button>
        <button
          type="button"
          disabled={pending || !guestPhone}
          onClick={resendSms}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-bold uppercase text-zinc-300 disabled:opacity-50"
        >
          <MessageSquare className="h-3 w-3" /> Send SMS
        </button>
        <button
          type="button"
          disabled={pending || missingContact}
          onClick={sendBothDirect}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-1.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          <Send className="h-3 w-3" /> Send both
        </button>
        <button
          type="button"
          disabled={pending || missingContact}
          onClick={sendBoth}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-bold uppercase text-gold-soft disabled:opacity-50"
        >
          Preview &amp; send
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={copyPortalLink}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-bold uppercase text-gold-soft disabled:opacity-50"
        >
          <Copy className="h-3 w-3" /> Copy portal link
        </button>
        <button
          type="button"
          disabled={pending || missingContact}
          onClick={sendBothDirect}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[10px] font-bold uppercase text-zinc-300 disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Resend
        </button>
      </div>
    </div>
  );
}
