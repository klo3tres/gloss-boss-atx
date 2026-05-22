'use client';

import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { techSendActiveJobNotificationAction } from '@/app/(dashboard)/tech/tech-actions';

export function NotificationSendForm({
  kind,
  appointmentId,
  fallbackBookingId,
  children,
  pendingText = 'Sending…',
  className,
  buttonClassName,
}: {
  kind: string;
  appointmentId?: string;
  fallbackBookingId?: string;
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <ToastActionForm action={techSendActiveJobNotificationAction} className={className}>
      <input type='hidden' name='kind' value={kind} />
      {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
      {fallbackBookingId ? <input type='hidden' name='fallbackBookingId' value={fallbackBookingId} /> : null}
      <SubmitStatusButton pendingText={pendingText} className={buttonClassName}>
        {children}
      </SubmitStatusButton>
    </ToastActionForm>
  );
}
