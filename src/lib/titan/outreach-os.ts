import type { SupabaseClient } from '@supabase/supabase-js';
import { glossBossEmailLayout, emailCtaButton } from '@/lib/email/templates/layout';
import { sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import type { ProspectType, TitanProspect } from '@/lib/titan/lead-radar';
import { prospectTypeLabel } from '@/lib/titan/lead-radar';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export type OutreachPackage = {
  callScript: string;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  followUpDays: number;
};

const BOOK = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://glossbossatx.com/book';

function templates(type: ProspectType, company: string, contact: string): OutreachPackage {
  const name = contact || 'there';
  const label = prospectTypeLabel(type);

  if (type === 'apartment_complex' || type === 'hoa' || type === 'property_manager') {
    return {
      callScript:
        `Hi ${name}, this is Gloss Boss ATX. We partner with ${label}s to offer resident vehicle detailing — monthly maintenance plans, on-site convenience, and resident discounts. Do you manage vendor relationships for ${company}?`,
      emailSubject: `Resident vehicle detailing partnership — ${company}`,
      emailBody:
        `Hi ${name},\n\nGloss Boss ATX helps ${label}s offer premium mobile detailing for residents — no hassle, no runoff issues, consistent quality.\n\nWe can structure:\n• Resident discount programs\n• Monthly maintenance washes\n• Move-in/move-out packages\n\nWould a 10-minute call this week make sense?`,
      smsBody: `Hi ${name}, Gloss Boss ATX — we help ${company} offer resident mobile detailing with monthly maintenance plans. Worth a quick call? ${BOOK}`,
      followUpDays: 3,
    };
  }

  if (type === 'landscaping' || type === 'construction') {
    return {
      callScript:
        `Hi ${name}, Gloss Boss ATX here. We work with ${label}s on fleet washing — trucks, trailers, equipment — so your crews look professional on every job site. Interested in a fleet rate for ${company}?`,
      emailSubject: `Fleet washing for ${company} crews`,
      emailBody:
        `Hi ${name},\n\nWe help ${label}s keep fleets and equipment looking sharp — mobile service, branding consistency, and crew-ready vehicles.\n\nHappy to quote a recurring fleet program for ${company}.`,
      smsBody: `Hi ${name}, Gloss Boss ATX — mobile fleet washing for ${company}. Professional appearance on every job. Quick quote? ${BOOK}`,
      followUpDays: 4,
    };
  }

  if (type === 'dealership' || type === 'fleet_operator') {
    return {
      callScript:
        `Hi ${name}, Gloss Boss ATX specializes in fleet and dealer-lot detailing for ${company}. We handle volume scheduling, consistent QC, and fast turnaround. Who handles vendor selection for detailing?`,
      emailSubject: `Fleet / lot detailing for ${company}`,
      emailBody:
        `Hi ${name},\n\nGloss Boss ATX provides mobile fleet and lot detailing — scheduled maintenance, photo-ready inventory, and volume pricing.\n\nLet's discuss a program tailored to ${company}.`,
      smsBody: `Hi ${name}, Gloss Boss ATX — fleet & lot detailing for ${company}. Volume pricing + consistent QC. ${BOOK}`,
      followUpDays: 3,
    };
  }

  return {
    callScript: `Hi ${name}, Gloss Boss ATX — we provide mobile detailing for businesses like ${company}. Open to a quick intro call?`,
    emailSubject: `Mobile detailing for ${company}`,
    emailBody: `Hi ${name},\n\nGloss Boss ATX is Austin's mobile detailing operator. We'd love to explore how we can support ${company}.\n\nBook or reply anytime.`,
    smsBody: `Hi ${name}, Gloss Boss ATX — mobile detailing for ${company}. ${BOOK}`,
    followUpDays: 5,
  };
}

export function generateOutreach(prospect: TitanProspect): OutreachPackage {
  return templates(prospect.prospectType, prospect.companyName, prospect.contactName ?? '');
}

export async function executeProspectOutreach(
  admin: SupabaseClient,
  prospectId: string,
  channel: 'email' | 'sms' | 'call' | 'visit',
): Promise<{ ok: boolean; error?: string; outreachId?: string }> {
  const { data } = await admin.from('titan_prospects').select('*').eq('id', prospectId).maybeSingle();
  if (!data) return { ok: false, error: 'Prospect not found' };

  const prospect: TitanProspect = {
    id: str(data.id),
    companyName: str(data.company_name),
    prospectType: str(data.prospect_type) as ProspectType,
    contactName: str(data.contact_name) || null,
    contactRole: str(data.contact_role) || null,
    email: str(data.email) || null,
    phone: str(data.phone) || null,
    address: str(data.address) || null,
    distanceMiles: null,
    estimatedMonthlyCents: Number(data.estimated_monthly_cents ?? 0),
    vehicleCount: null,
    score: Number(data.score ?? 0),
    scoreReason: str(data.score_reason) || null,
    status: str(data.status),
    source: str(data.source),
    leadId: str(data.lead_id) || null,
  };

  const pkg = generateOutreach(prospect);
  const now = new Date().toISOString();
  let status: 'sent' | 'draft' | 'failed' = 'draft';
  let leadId = prospect.leadId;

  if (!leadId) {
    const { promoteProspectToPipeline } = await import('@/lib/titan/lead-radar');
    const promoted = await promoteProspectToPipeline(admin, prospectId);
    if (promoted.ok) leadId = promoted.leadId;
  }

  if (channel === 'email' && prospect.email) {
    const html = glossBossEmailLayout({
      title: pkg.emailSubject,
      bodyHtml: `<p style="color:#fafafa;font-size:15px;line-height:1.6;">${pkg.emailBody.replace(/\n/g, '<br/>')}</p>${emailCtaButton(BOOK, 'Book a call')}`,
    });
    const sent = await sendResendHtml({ to: prospect.email, subject: pkg.emailSubject, html });
    status = sent.ok ? 'sent' : 'failed';
    if (!sent.ok) return { ok: false, error: sent.error ?? 'Email failed' };
  } else if (channel === 'sms' && prospect.phone) {
    const res = await sendCustomerSms({
      db: admin,
      kind: 'prospect_outreach',
      template_key: 'titan_outreach',
      to: prospect.phone,
      body: pkg.smsBody,
    });
    status = res.ok ? 'sent' : 'failed';
    if (!res.ok) return { ok: false, error: res.error ?? 'SMS failed' };
  } else if (channel === 'call' || channel === 'visit') {
    status = 'draft';
  } else {
    return { ok: false, error: 'No email or phone for automated send. Use call script.' };
  }

  const followUp = new Date(Date.now() + pkg.followUpDays * 86400000).toISOString();
  const { data: play } = await admin
    .from('titan_outreach_plays')
    .insert({
      prospect_id: prospectId,
      lead_id: leadId,
      channel,
      call_script: pkg.callScript,
      email_subject: pkg.emailSubject,
      email_body: pkg.emailBody,
      sms_body: pkg.smsBody,
      follow_up_days: pkg.followUpDays,
      status,
      sent_at: status === 'sent' ? now : null,
      created_at: now,
    })
    .select('id')
    .maybeSingle();

  await admin
    .from('titan_prospects')
    .update({
      status: 'contacted',
      last_contacted_at: now,
      next_follow_up_at: followUp,
      updated_at: now,
    })
    .eq('id', prospectId);

  if (leadId) {
    await admin.from('leads').update({ next_follow_up_at: followUp, status: 'contacted', updated_at: now }).eq('id', leadId);
  }

  if (status === 'sent') {
    await logTitanActivity(admin, {
      kind: 'outreach_sent',
      title: `Outreach sent to ${prospect.companyName}`,
      detail: `${channel.toUpperCase()} · ${prospectTypeLabel(prospect.prospectType)}`,
      href: '/admin/super',
    });
  }

  return { ok: true, outreachId: str(play?.id) };
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}
