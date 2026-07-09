import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { ingestExternalLead, type ExternalLeadInput } from '@/lib/titan/external-leads-intake';
import { resolveBusinessFromLeadAuth } from '@/lib/titan/api-keys';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function extractApiKey(request: Request, body: Record<string, unknown>): string {
  const auth = request.headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return str(body.api_key);
}

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const apiKey = extractApiKey(request, body);
  const auth = await resolveBusinessFromLeadAuth(admin, {
    apiKey: apiKey || undefined,
    businessId: str(body.business_id) || undefined,
  });

  if (!auth.ok || !auth.businessId) {
    return NextResponse.json({ ok: false, error: auth.error ?? 'Unauthorized' }, { status: 401 });
  }

  const input: ExternalLeadInput = {
    name: str(body.name) || undefined,
    phone: str(body.phone) || undefined,
    email: str(body.email) || undefined,
    company: str(body.company) || undefined,
    service_interest: str(body.service_interest) || undefined,
    budget: str(body.budget) || undefined,
    timeline: str(body.timeline) || undefined,
    message: str(body.message) || undefined,
    source: str(body.source) || 'website_form',
    page_url: str(body.page_url) || undefined,
    utm_source: str(body.utm_source) || undefined,
    utm_medium: str(body.utm_medium) || undefined,
    utm_campaign: str(body.utm_campaign) || undefined,
    utm_term: str(body.utm_term) || undefined,
    utm_content: str(body.utm_content) || undefined,
    notes: str(body.notes) || undefined,
    opportunity_type: str(body.opportunity_type) || undefined,
  };

  if (!input.name && !input.email && !input.phone) {
    return NextResponse.json({ ok: false, error: 'name, email, or phone required' }, { status: 400 });
  }

  const result = await ingestExternalLead(admin, auth.businessId, input, { apiKeyId: auth.keyId });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    lead_id: result.leadId,
    contact_id: result.contactId,
    opportunity_id: result.opportunityId,
    action_id: result.actionId,
  });
}
