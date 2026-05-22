'use client';

import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { sendIntegrationTestAction } from '@/app/(dashboard)/admin/integrations/integration-actions';

export function IntegrationResendTestForm() {
  return (
    <ToastActionForm action={sendIntegrationTestAction} className='flex flex-wrap gap-2'>
      <input type='hidden' name='kind' value='resend_test' />
      <input name='destination' placeholder='test@email.com' className='min-w-0 flex-1 rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
      <SubmitStatusButton pendingText='Sending…' className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-60'>
        Send Test Email
      </SubmitStatusButton>
    </ToastActionForm>
  );
}

export function IntegrationTwilioTestForm() {
  return (
    <ToastActionForm action={sendIntegrationTestAction} className='flex flex-wrap gap-2'>
      <input type='hidden' name='kind' value='twilio_test' />
      <input name='destination' placeholder='5125551212' className='min-w-0 flex-1 rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
      <SubmitStatusButton pendingText='Sending…' className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-60'>
        Send Test SMS
      </SubmitStatusButton>
    </ToastActionForm>
  );
}
