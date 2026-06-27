'use client';

import { useRef, useState, useTransition } from 'react';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import {
  previewTechJobNotificationAction,
  techSendActiveJobNotificationAction,
} from '@/app/(dashboard)/tech/tech-actions';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';

const UPDATE_TEMPLATES = [
  { value: 'technician_on_the_way', label: 'Technician on the way' },
  { value: 'job_started', label: 'Service started' },
  { value: 'halfway_complete', label: 'Halfway complete' },
  { value: 'last_touches', label: 'Final touches' },
  { value: 'job_completed', label: 'Service completed' },
  { value: 'payment_link', label: 'Payment reminder' },
  { value: 'review_request', label: 'Review request' },
];

export function NotificationSendForm({
  kind,
  appointmentId,
  fallbackBookingId,
  children,
  pendingText = 'Sending…',
  className,
  buttonClassName,
  vehicleLabel,
  guestName,
}: {
  kind: string;
  appointmentId?: string;
  fallbackBookingId?: string;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  buttonClassName?: string;
  vehicleLabel?: string;
  guestName?: string;
}) {
  const { openPreview } = useOutboundPreview();
  const [selectedKind, setSelectedKind] = useState(kind);
  const [pending, startTransition] = useTransition();
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);
  const customBodyRef = useRef<HTMLInputElement>(null);

  const openSendPreview = () => {
    startTransition(async () => {
      const preview = await previewTechJobNotificationAction({
        appointmentId,
        fallbackBookingId,
        kind: selectedKind,
      });
      if (preview.error || !preview.body || !preview.recipient) {
        alert(preview.error ?? 'Could not build preview.');
        return;
      }
      const tones = buildToneVariants(preview.body, { name: guestName });
      const channel = preview.channel ?? 'sms';
      openPreview({
        title: channel === 'sms' ? 'Send customer SMS' : 'Send customer email',
        channel,
        recipient: preview.recipient,
        body: tones.professional,
        subject: preview.subject,
        toneVariants: tones,
        contextLabel: [guestName, vehicleLabel].filter(Boolean).join(' · ') || 'Work order update',
        onSend: async (final) => {
          if (customBodyRef.current) customBodyRef.current.value = final.body;
          hiddenSubmitRef.current?.click();
          return { ok: true };
        },
      });
    });
  };

  return (
    <>
      <ToastActionForm action={techSendActiveJobNotificationAction} className={className}>
        <input type="hidden" name="kind" value={selectedKind} />
        <input type="hidden" name="customBody" ref={customBodyRef} defaultValue="" />
        {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
        {fallbackBookingId ? <input type="hidden" name="fallbackBookingId" value={fallbackBookingId} /> : null}

        <div className="space-y-2">
          <select
            value={selectedKind}
            onChange={(e) => setSelectedKind(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
            aria-label="Update template"
          >
            {UPDATE_TEMPLATES.map((template) => (
              <option key={template.value} value={template.value}>
                {template.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={openSendPreview}
            disabled={pending}
            className={buttonClassName}
          >
            {pending ? pendingText : children}
          </button>
        </div>

        <button type="submit" ref={hiddenSubmitRef} className="hidden" />
      </ToastActionForm>
    </>
  );
}
