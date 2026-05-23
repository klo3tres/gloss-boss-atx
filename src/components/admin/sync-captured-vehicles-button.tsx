'use client';

import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { syncCapturedVehiclesAction } from '@/app/(dashboard)/admin/customer-vehicle-actions';

export function SyncCapturedVehiclesButton({ customerId }: { customerId: string }) {
  return (
    <ToastActionForm action={syncCapturedVehiclesAction} className='mt-3'>
      <input type='hidden' name='customerId' value={customerId} />
      <SubmitStatusButton
        pendingText='Syncing…'
        className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'
      >
        Sync captured vehicles to CRM
      </SubmitStatusButton>
    </ToastActionForm>
  );
}
