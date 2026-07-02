'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { sendCustomerSms } from '@/lib/sms-send';
import { twilioCredentialsPresent, twilioSenderReady } from '@/lib/twilio-config';
import { describeTwilioDelivery } from '@/lib/twilio-delivery';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';

export async function sendTwilioTestSmsAction(phone: string): Promise<{
  ok?: boolean;
  error?: string;
  message?: string;
  sid?: string;
  detail?: string;
}> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) {
    return { error: 'Forbidden' };
  }

  if (!twilioCredentialsPresent() || !twilioSenderReady()) {
    return { error: 'Twilio is not fully configured. Set SID, auth token, and From number or Messaging Service.' };
  }

  const body =
    'Gloss Boss ATX test: Customer SMS delivery check. If you received this, Twilio can reach this number.';

  const result = await sendCustomerSms({
    db: admin,
    kind: 'twilio_test',
    template_key: 'twilio_test',
    to: phone,
    body,
    requireConsent: false,
    extraPayload: { test: true, initiated_by: session.user.id },
  });

  const detail = describeTwilioDelivery(result.deliveryStatus ?? (result.ok ? 'sent' : 'failed'), {
    errorMessage: result.carrierError ?? result.error,
    sid: result.sid,
  }).detail;

  await emitOwnerNotification(admin, {
    eventType: result.ok ? 'new_booking' : 'delivery_failed',
    title: result.ok ? 'Twilio test SMS sent' : 'Twilio test SMS failed',
    body: [phone, detail, result.error].filter(Boolean).join(' · '),
    source: 'twilio_test',
    bypassQuietHours: !result.ok,
    smsStatus: result.ok ? 'sent' : 'failed',
  });

  revalidatePath('/admin/setup-center');

  if (result.skipped) return { error: result.error ?? 'SMS skipped.' };
  if (!result.ok) return { error: result.error ?? 'Twilio send failed.', detail };

  return {
    ok: true,
    message: 'Test SMS accepted by Twilio.',
    sid: result.sid,
    detail,
  };
}
