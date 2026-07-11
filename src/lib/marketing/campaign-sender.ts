import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketingCampaign } from '@/lib/business-modules';
import { sendCustomerSms } from '@/lib/sms-send';
import { logOutboundMessage } from '@/app/(dashboard)/admin/outbound-message-actions';

type Recipient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  emailMarketingOptIn?: boolean | null;
  smsConsent?: boolean | null;
  smsStatus?: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function mapCustomerRow(row: Record<string, unknown>): Recipient {
  return {
    id: str(row.id),
    name: str(row.full_name) || 'Customer',
    email: str(row.email) || null,
    phone: str(row.phone) || null,
    emailMarketingOptIn: row.email_marketing_opt_in == null ? null : Boolean(row.email_marketing_opt_in),
    smsConsent: row.sms_consent == null ? null : Boolean(row.sms_consent),
    smsStatus: str(row.sms_status) || null,
  };
}

async function loadCustomersByIds(admin: SupabaseClient, ids: string[]): Promise<Recipient[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const { data } = await admin
    .from('customers')
    .select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in')
    .in('id', unique.slice(0, 500));
  return (data ?? []).map((c) => mapCustomerRow(c as Record<string, unknown>));
}

async function resolveAudience(admin: SupabaseClient, audience: string): Promise<Recipient[]> {
  const hay = audience.toLowerCase();
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();

  if (hay.includes('opted_in_marketing') || hay.includes('opted-in marketing') || (hay.includes('opted in') && hay.includes('marketing'))) {
    const { data: customers } = await admin
      .from('customers')
      .select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in')
      .eq('email_marketing_opt_in', true)
      .limit(500);
    return (customers ?? []).map((c) => mapCustomerRow(c as Record<string, unknown>));
  }

  if (/\bmembers?\b/.test(hay) && !hay.includes('non-member') && !hay.includes('non member')) {
    try {
      const { data: memberships } = await admin
        .from('customer_memberships')
        .select('customer_id')
        .eq('status', 'active')
        .limit(500);
      const ids = (memberships ?? []).map((m) => str((m as { customer_id?: string }).customer_id)).filter(Boolean);
      return await loadCustomersByIds(admin, ids);
    } catch {
      return [];
    }
  }

  if (hay.includes('non-member') || hay.includes('non member') || hay.includes('non_member')) {
    try {
      const [{ data: customers }, { data: memberships }] = await Promise.all([
        admin.from('customers').select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in').limit(500),
        admin.from('customer_memberships').select('customer_id').eq('status', 'active').limit(500),
      ]);
      const memberIds = new Set(
        (memberships ?? []).map((m) => str((m as { customer_id?: string }).customer_id)).filter(Boolean),
      );
      return (customers ?? [])
        .map((c) => mapCustomerRow(c as Record<string, unknown>))
        .filter((r) => r.id && !memberIds.has(r.id));
    } catch {
      const { data: customers } = await admin
        .from('customers')
        .select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in')
        .limit(500);
      return (customers ?? []).map((c) => mapCustomerRow(c as Record<string, unknown>));
    }
  }

  if (hay.includes('ceramic')) {
    try {
      const { data: appts } = await admin
        .from('appointments')
        .select('customer_id')
        .ilike('service_slug', '%ceramic%')
        .not('customer_id', 'is', null)
        .limit(500);
      const ids = (appts ?? []).map((a) => str((a as { customer_id?: string }).customer_id)).filter(Boolean);
      return await loadCustomersByIds(admin, ids);
    } catch {
      return [];
    }
  }

  if (hay.includes('loyalty')) {
    try {
      const { data: stamps } = await admin.from('loyalty_stamps').select('customer_id').limit(500);
      const ids = (stamps ?? []).map((s) => str((s as { customer_id?: string }).customer_id)).filter(Boolean);
      return await loadCustomersByIds(admin, ids);
    } catch {
      return [];
    }
  }

  if (hay.includes('referral_credit') || hay.includes('referral credit')) {
    try {
      const { data: credits } = await admin
        .from('customer_credits')
        .select('customer_id, type, reason, status, remaining_cents')
        .in('status', ['active', 'partially_used'])
        .limit(500);
      const ids = (credits ?? [])
        .filter((c) => {
          const row = c as { type?: string; reason?: string; remaining_cents?: number };
          const t = `${str(row.type)} ${str(row.reason)}`.toLowerCase();
          return t.includes('referral') && Number(row.remaining_cents ?? 0) > 0;
        })
        .map((c) => str((c as { customer_id?: string }).customer_id))
        .filter(Boolean);
      return await loadCustomersByIds(admin, ids);
    } catch {
      return [];
    }
  }

  if (hay.includes('overdue')) {
    try {
      const [{ data: appts }, { data: followUps }] = await Promise.all([
        admin
          .from('appointments')
          .select('customer_id, guest_email, guest_name, guest_phone, balance_due_cents')
          .gt('balance_due_cents', 0)
          .not('status', 'in', '("cancelled","completed")')
          .limit(300),
        admin
          .from('customer_follow_ups')
          .select('customer_id')
          .eq('status', 'pending')
          .lte('due_at', new Date().toISOString())
          .limit(300),
      ]);
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
      const followIds = (followUps ?? []).map((f) => str((f as { customer_id?: string }).customer_id)).filter(Boolean);
      const loaded = await loadCustomersByIds(admin, followIds);
      for (const r of loaded) byId.set(r.id, r);
      if (byId.size) return [...byId.values()];
    } catch {
      /* fall through */
    }
  }

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
    const customerIds = [...byId.keys()].filter((id) => id.length === 36);
    if (customerIds.length) {
      const enriched = await loadCustomersByIds(admin, customerIds);
      for (const r of enriched) {
        const prev = byId.get(r.id);
        byId.set(r.id, {
          ...r,
          email: r.email || prev?.email || null,
          phone: r.phone || prev?.phone || null,
          name: r.name !== 'Customer' ? r.name : prev?.name || r.name,
        });
      }
    }
    return [...byId.values()];
  }

  const { data: customers } = await admin
    .from('customers')
    .select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in')
    .limit(500);
  return (customers ?? []).map((c) => mapCustomerRow(c as Record<string, unknown>));
}

export async function executeMarketingCampaign(
  admin: SupabaseClient,
  campaign: MarketingCampaign,
): Promise<{ ok: boolean; sent: number; skipped: number; excluded: number; errors: string[] }> {
  if (!campaign.message.trim()) {
    return { ok: false, sent: 0, skipped: 0, excluded: 0, errors: ['Campaign message is empty.'] };
  }

  const recipients = await resolveAudience(admin, campaign.audience);
  if (recipients.length === 0) {
    return { ok: false, sent: 0, skipped: 0, excluded: 0, errors: ['No recipients matched this audience.'] };
  }

  const errors: string[] = [];
  let sent = 0;
  let skipped = 0;
  let excluded = 0;
  const wantsEmail = campaign.channel === 'email' || campaign.channel === 'both';
  const wantsSms = campaign.channel === 'sms' || campaign.channel === 'both';

  if (wantsEmail) {
    const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
    if (!resendConfigured()) {
      return { ok: false, sent: 0, skipped: recipients.length, excluded: 0, errors: ['Resend is not configured.'] };
    }
    for (const r of recipients) {
      if (r.emailMarketingOptIn !== true) {
        excluded += 1;
        continue;
      }
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
  }

  if (wantsSms) {
    const { twilioConfigured } = await import('@/lib/email-send');
    if (!twilioConfigured()) {
      if (!wantsEmail) {
        return { ok: false, sent: 0, skipped: recipients.length, excluded, errors: ['Twilio is not configured.'] };
      }
      errors.push('Twilio is not configured — SMS portion skipped.');
    } else {
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
    }
  }

  if (!wantsEmail && !wantsSms) {
    return {
      ok: false,
      sent: 0,
      skipped: recipients.length,
      excluded: 0,
      errors: [`Channel "${campaign.channel}" is draft-only — use email or SMS to send.`],
    };
  }

  return { ok: sent > 0, sent, skipped, excluded, errors: errors.slice(0, 8) };
}
