'use client';

import { useState, useRef } from 'react';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { techSendActiveJobNotificationAction } from '@/app/(dashboard)/tech/tech-actions';

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
  const [showModal, setShowModal] = useState(false);
  const [selectedKind, setSelectedKind] = useState(kind);
  const hiddenSubmitRef = useRef<HTMLButtonElement>(null);

  const vehicle = vehicleLabel || 'your vehicle';
  
  // Construct client-side message preview matches tech-actions message builders
  let previewText = '';
  const dashboardUrl = typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : '/dashboard';
  
  switch (selectedKind) {
    case 'technician_on_the_way':
      previewText = `Gloss Boss ATX update: Your technician is on the way for ${vehicle}. Track updates here: ${dashboardUrl}`;
      break;
    case 'halfway_complete':
      previewText = `Gloss Boss ATX update: We are about halfway through ${vehicle}. Track updates here: ${dashboardUrl}`;
      break;
    case 'last_touches':
      previewText = `Gloss Boss ATX update: We are doing the last touches on ${vehicle}. Track updates here: ${dashboardUrl}`;
      break;
    case 'payment_link':
      previewText = `Gloss Boss ATX update: Your service payment link is ready for ${vehicle}. Pay here: [Stripe Checkout URL] (or track here: ${dashboardUrl})`;
      break;
    case 'job_started':
    case 'work_started':
      previewText = `Gloss Boss ATX update: Work has started on ${vehicle}. Track live progress here: ${dashboardUrl}`;
      break;
    case 'job_completed':
      previewText = `Gloss Boss ATX update: Your detail is complete for ${vehicle}. Photos and receipt are available here: ${dashboardUrl}`;
      break;
    case 'review_request':
      previewText = `Gloss Boss ATX update: Thanks for choosing Gloss Boss ATX. Review your completed service here: ${dashboardUrl}`;
      break;
    default:
      previewText = `Gloss Boss ATX update: Thanks for choosing Gloss Boss ATX. Track your service here: ${dashboardUrl}`;
  }

  const handleConfirm = () => {
    setShowModal(false);
    hiddenSubmitRef.current?.click();
  };

  return (
    <>
      <ToastActionForm action={techSendActiveJobNotificationAction} className={className}>
        <input type='hidden' name='kind' value={selectedKind} />
        {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
        {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
        
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className={buttonClassName}
        >
          {children}
        </button>

        <button type="submit" ref={hiddenSubmitRef} className="hidden" />
      </ToastActionForm>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
          <div className="gb-glass w-full max-w-md rounded-3xl border border-gold/30 bg-black/95 p-6 space-y-4 text-left shadow-[0_0_50px_rgba(212,175,55,0.15)] animate-in fade-in duration-200">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1">Message Outbox Preview</p>
              <h3 className="text-lg font-bold text-white">Confirm Customer Message</h3>
            </div>

            <label className="block text-xs font-black uppercase tracking-wider text-zinc-400">
              Update template
              <select
                value={selectedKind}
                onChange={(e) => setSelectedKind(e.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white"
              >
                {UPDATE_TEMPLATES.map((template) => (
                  <option key={template.value} value={template.value}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            
            <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {previewText}
            </div>

            <p className="text-[10px] text-zinc-500">
              Confirm before sending. This message goes to the customer via active SMS and email templates.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-black uppercase text-zinc-400 hover:text-white transition duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition duration-200 shadow-[0_0_15px_rgba(212,175,55,0.3)]"
              >
                Confirm & Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
