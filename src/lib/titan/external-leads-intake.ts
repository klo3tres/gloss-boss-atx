import type { SupabaseClient } from '@supabase/supabase-js';
import { initialOpportunityFollowUpAt } from '@/lib/opportunity-follow-up-timing';
import { createRevenueOpportunity } from '@/lib/titan/revenue-opportunities';
import { loadBusinessById } from '@/lib/titan/business-context';
import { logConnectionEvent } from '@/lib/titan/integrations';
import { opportunityTypesForIndustry } from '@/lib/titan/industry-profiles';

export type ExternalLeadInput = {
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  service_interest?: string;
  budget?: string;
  timeline?: string;
  message?: string;
  source?: string;
  page_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  notes?: string;
  opportunity_type?: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function matchOrCreateContact(
  admin: SupabaseClient,
  businessId: string,
  input: ExternalLeadInput,
): Promise<string | null> {
  const email = str(input.email).toLowerCase();
  const phone = str(input.phone);

  if (email) {
    const { data } = await admin
      .from('business_contacts')
      .select('id')
      .eq('business_id', businessId)
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  if (phone) {
    const digits = phone.replace(/\D/g, '').slice(-10);
    if (digits) {
      const { data } = await admin
        .from('business_contacts')
        .select('id')
        .eq('business_id', businessId)
        .ilike('phone', `%${digits}`)
        .limit(1)
        .maybeSingle();
      if (data?.id) return String(data.id);
    }
  }

  const { data: created, error } = await admin
    .from('business_contacts')
    .insert({
      business_id: businessId,
      full_name: str(input.name) || null,
      email: email || null,
      phone: phone || null,
      company: str(input.company) || null,
      source: str(input.source) || 'api',
    })
    .select('id')
    .single();

  if (error) return null;
  return str((created as { id?: string }).id) || null;
}

async function loadDefaultFollowUpSequenceId(admin: SupabaseClient, businessId: string): Promise<string | null> {
  const { data } = await admin
    .from('titan_followup_sequences')
    .select('id')
    .eq('business_id', businessId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

function inferOpportunityType(businessIndustry: string, input: ExternalLeadInput): string {
  if (input.opportunity_type) return input.opportunity_type;
  const interest = str(input.service_interest).toLowerCase();
  if (businessIndustry === 'web_agency' || businessIndustry === 'marketing_agency') {
    if (interest.includes('seo')) return 'seo';
    if (interest.includes('host')) return 'hosting';
    if (interest.includes('redesign') || interest.includes('redesign')) return 'redesign';
    if (interest.includes('ads') || interest.includes('ppc')) return 'ads';
    return 'website_project';
  }
  if (interest.includes('fleet')) return 'fleet_quote';
  if (interest.includes('member')) return 'membership_upsell';
  return 'external_lead';
}

function buildOpportunityTitle(input: ExternalLeadInput, oppType: string): string {
  const name = str(input.name) || str(input.company) || 'New lead';
  const interest = str(input.service_interest);
  if (interest) return `${name} — ${interest}`;
  return `${name} — ${oppType.replace(/_/g, ' ')}`;
}

export async function ingestExternalLead(
  admin: SupabaseClient,
  businessId: string,
  input: ExternalLeadInput,
  opts?: { apiKeyId?: string },
): Promise<{
  ok: boolean;
  leadId?: string;
  contactId?: string | null;
  opportunityId?: string;
  actionId?: string;
  error?: string;
}> {
  const business = await loadBusinessById(admin, businessId);
  if (!business) return { ok: false, error: 'Business not found' };

  const contactId = await matchOrCreateContact(admin, businessId, input);
  const now = new Date().toISOString();

  const { data: leadRow, error: leadErr } = await admin
    .from('external_leads')
    .insert({
      business_id: businessId,
      contact_id: contactId,
      source: str(input.source) || 'api',
      name: str(input.name) || null,
      phone: str(input.phone) || null,
      email: str(input.email) || null,
      company: str(input.company) || null,
      service_interest: str(input.service_interest) || null,
      budget: str(input.budget) || null,
      timeline: str(input.timeline) || null,
      message: str(input.message) || null,
      page_url: str(input.page_url) || null,
      utm_source: str(input.utm_source) || null,
      utm_medium: str(input.utm_medium) || null,
      utm_campaign: str(input.utm_campaign) || null,
      utm_term: str(input.utm_term) || null,
      utm_content: str(input.utm_content) || null,
      notes: str(input.notes) || null,
      raw_payload: input,
      status: 'new',
      api_key_id: opts?.apiKeyId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (leadErr) return { ok: false, error: leadErr.message };
  const leadId = str((leadRow as { id?: string }).id);

  const oppType = inferOpportunityType(business.industry, input);
  const validTypes = opportunityTypesForIndustry(business.industry).map((t) => t.key);
  const safeType = validTypes.includes(oppType) ? oppType : 'external_lead';

  const title = buildOpportunityTitle(input, safeType);
  const whySurfaced = [
    str(input.message),
    str(input.page_url) ? `Source page: ${input.page_url}` : '',
    str(input.utm_campaign) ? `Campaign: ${input.utm_campaign}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const oppRes = await createRevenueOpportunity(
    admin,
    {
      title,
      opportunityType: safeType,
      estimatedRevenueCents: 0,
      contactName: str(input.name) || undefined,
      contactPhone: str(input.phone) || undefined,
      contactEmail: str(input.email) || undefined,
      notes: str(input.message) || str(input.notes) || undefined,
      whySurfaced: whySurfaced || 'External website lead',
      source: str(input.source) || 'Website API',
      confidenceScore: 70,
    },
    business.workspaceKey,
  );

  if (!oppRes.ok || !oppRes.id) {
    return { ok: false, error: oppRes.error ?? 'Failed to create opportunity', leadId };
  }

  const sequenceId = await loadDefaultFollowUpSequenceId(admin, businessId);
  await admin
    .from('titan_opportunities')
    .update({
      business_id: businessId,
      external_lead_id: leadId,
      industry_profile_key: business.industry,
      followup_sequence_id: sequenceId,
      next_follow_up_at: initialOpportunityFollowUpAt(),
      updated_at: now,
    })
    .eq('id', oppRes.id);

  await admin.from('external_leads').update({ opportunity_id: oppRes.id, status: 'converted', updated_at: now }).eq('id', leadId);

  const pitch = str(input.message) || `Thanks for reaching out about ${str(input.service_interest) || 'our services'}.`;
  const { data: actionRow } = await admin
    .from('titan_actions')
    .insert({
      business_id: businessId,
      action_type: 'first_pitch',
      title: `Send first pitch — ${str(input.name) || title}`,
      description: 'Day 0 follow-up from external lead intake',
      status: 'pending',
      priority: 90,
      entity_type: 'opportunity',
      entity_id: oppRes.id,
      contact_phone: str(input.phone) || null,
      contact_email: str(input.email) || null,
      message_script: pitch,
      metadata: { lead_id: leadId, step: 0 },
    })
    .select('id')
    .single();

  await logConnectionEvent(admin, {
    businessId,
    integrationType: 'website_forms',
    eventType: 'lead_received',
    message: `External lead: ${title}`,
    metadata: { lead_id: leadId, opportunity_id: oppRes.id },
  });

  try {
    await admin.from('notification_outbox').insert({
      kind: 'external_lead_intake',
      channel: 'system',
      status: 'sent',
      payload: {
        business_id: businessId,
        lead_id: leadId,
        opportunity_id: oppRes.id,
        name: input.name,
        source: input.source,
      },
      created_at: now,
    });
  } catch {
    /* optional */
  }

  return {
    ok: true,
    leadId,
    contactId,
    opportunityId: oppRes.id,
    actionId: actionRow?.id ? String(actionRow.id) : undefined,
  };
}
