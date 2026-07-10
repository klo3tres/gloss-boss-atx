import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingCampaign } from '@/lib/business-modules';
import { sendCustomerSms } from '@/lib/sms-send';
import { logOutboundMessage } from '@/app/(dashboard)/admin/outbound-message-actions';

type Recipient = { id: string; name: string; email: string | null; phone: string | null };

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function resolveAudience(admin: SupabaseClient, audience: string): Promise<Recipient[]> {
  const hay = audience.toLowerCase();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();

  if (hay.includes('90') || hay.includes('recent') || hay.includes('completed')) {
    const { data: appts } = await admin
      .from('appointments')
      .select('customer_id, guest_email, guest_name, guest_phone')
      .gte('scheduled_start', since90)
      .in('status', ['completed', 'confirmed', 'in_progress', 'scheduled']);
    const byId = new Map<string, Recipient>();
    for (const a of appts ?? []) {
      const row = a as Record<string, unknown>;
      const id = str(row.customer_id) || str(row.guest_email) || str(row.guest_phone);
      if (!id) continue;
      byId.set(id, {
        id,
        name: str(row.guest_name) || 'Customer',
        email: str(row.guest_email) || null,
        phone: str(row.guest_phone) || null,
      });
    }
    return [...byId.values()];
  }

  const { data: customers } = await admin
    .from('customers')
    .select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in')
    .limit(500);
  return (customers ?? []).map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: str(row.id),
      name: str(row.full_name) || 'Customer',
      email: str(row.email) || null,
      phone: str(row.phone) || null,
    };
  });
}

export async function executeMarketingCampaign(
  admin: SupabaseClient,
  campaign: MarketingCampaign,
): Promise<{ ok: boolean; sent: number; skipped: number; errors: string[] }> {
  if (!campaign.message.trim()) {
    return { ok: false, sent: 0, skipped: 0, errors: ['Campaign message is empty.'] };
  }

  const recipients = await resolveAudience(admin, campaign.audience);
  if (recipients.length === 0) {
    return { ok: false, sent: 0, skipped: 0, errors: ['No recipients matched this audience.'] };
  }

  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;

  if (campaign.channel === 'sms') {
    const { twilioConfigured } = await import('@/lib/email-send');
    if (!twilioConfigured()) {
      return { ok: false, sent: 0, skipped: recipients.length, errors: ['Twilio is not configured.'] };
    }
    for (const r of recipients) {
      if (!r.phone) {
        skipped += 1;
        continue;
      }
      const body = campaign.message.replace(/\{name\}/gi, r.name.split(' ')[0] || 'there');
      const res = await sendCustomerSms({
        db: admin,
        kind: 'marketing_campaign',
        to: r.phone,
        body,
        requireConsent: true,
        template_key: `campaign_${campaign.id}`,
        extraPayload: { campaign_id: campaign.id, campaign_name: campaign.name },
      });
      if (res.ok) {
        sent += 1;
        await logOutboundMessage(admin, {
          kind: 'marketing_campaign',
          channel: 'sms',
          status: 'sent',
          body,
          recipient: r.phone,
          customer_id: r.id.length === 36 ? r.id : null,
          entity_type: 'marketing_campaign',
          entity_id: campaign.id,
        });
      } else {
        errors.push(`${r.phone}: ${res.error ?? 'failed'}`);
      }
    }
  } else if (campaign.channel === 'email') {
    const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
    if (!resendConfigured()) {
      return { ok: false, sent: 0, skipped: recipients.length, errors: ['Resend is not configured.'] };
    }
    for (const r of recipients) {
      if (!r.email) {
        skipped += 1;
        continue;
      }
      const body = campaign.message.replace(/\{name\}/gi, r.name.split(' ')[0] || 'there');
      const res = await sendResendHtml({
        to: r.email,
        subject: campaign.name,
        html: `<div style="font-family:sans-serif;line-height:1.5">${body.replace(/\n/g, '<br/>')}</div>`,
      });
      if (res.ok) {
        sent += 1;
        await logOutboundMessage(admin, {
          kind: 'marketing_campaign',
          channel: 'email',
          status: 'sent',
          body,
          subject: campaign.name,
          recipient: r.email,
          customer_id: r.id.length === 36 ? r.id : null,
          entity_type: 'marketing_campaign',
          entity_id: campaign.id,
        });
      } else {
        errors.push(`${r.email}: ${res.error ?? 'failed'}`);
      }
    }
  } else {
    return {
      ok: false,
      sent: 0,
      skipped: recipients.length,
      errors: [`Channel "${campaign.channel}" is draft-only — use email or SMS to send.`],
    };
  }

  return { ok: sent > 0, sent, skipped, errors: errors.slice(0, 8) };
}
