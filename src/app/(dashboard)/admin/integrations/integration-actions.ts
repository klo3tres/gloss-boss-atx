'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { glossBossEmailShell } from '@/lib/email-brand';
import { resendConfigured, sendResendHtml, sendTwilioSms, twilioConfigured } from '@/lib/email-send';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, email: session.user.email ?? null, userId: session.user.id };
}

export async function sendIntegrationTestAction(formData: FormData) {
  const g = await gate();
  if (!g) return;
  const kind = String(formData.get('kind') ?? '').trim();
  const destination = String(formData.get('destination') ?? '').trim();
  let status = 'skipped';
  let error: string | null = null;
  if (kind === 'resend_test') {
    if (!resendConfigured()) error = 'Resend missing RESEND_API_KEY or RESEND_FROM_EMAIL.';
    else {
      const to = destination.includes('@') ? destination : g.email;
      if (!to) error = 'No test email destination.';
      else {
        const sent = await sendResendHtml({
          to,
          subject: 'Gloss Boss ATX integration test',
          html: glossBossEmailShell({ title: 'Integration test', bodyHtml: '<p style="color:#fafafa;">Resend is connected.</p>' }),
        });
        status = sent.ok ? 'sent' : 'failed';
        error = sent.ok ? null : /403|domain/i.test(sent.error ?? '') ? 'Resend domain not verified. Verify domain before sending to customers.' : sent.error ?? 'Resend send failed.';
      }
    }
  } else if (kind === 'twilio_test') {
    if (!twilioConfigured()) error = 'Twilio missing SID, token, or from number.';
    else if (!destination) error = 'Enter a test phone number.';
    else {
      const sent = await sendTwilioSms({ to: destination, body: 'Gloss Boss ATX test SMS: Twilio is connected.' });
      status = sent.ok ? 'sent' : 'failed';
      error = sent.ok ? null : sent.error ?? 'Twilio send failed.';
    }
  }
  if (error && status === 'skipped') status = 'skipped';
  await g.admin.from('integration_test_events').insert({
    kind,
    status,
    destination: destination || g.email,
    error_message: error,
    actor_id: g.userId,
    created_at: new Date().toISOString(),
  });
  revalidatePath('/admin/integrations');
}
