import type { SupabaseClient } from '@supabase/supabase-js';
import { loadDiscoverySummary, type DiscoverySummary } from '@/lib/titan/places-discovery';

export type { DiscoverySummary };

export type ProspectType =
  | 'apartment_complex'
  | 'dealership'
  | 'fleet_operator'
  | 'construction'
  | 'landscaping'
  | 'property_manager'
  | 'hoa'
  | 'realtor'
  | 'other';

export type TitanProspect = {
  id: string;
  companyName: string;
  prospectType: ProspectType;
  contactName: string | null;
  contactRole: string | null;
  decisionMakerTitle: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  distanceMiles: number | null;
  estimatedMonthlyCents: number;
  vehicleCount: number | null;
  score: number;
  scoreReason: string | null;
  status: string;
  source: string;
  acquisitionSource: string | null;
  notes: string | null;
  leadId: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  discoveredAt: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function isMissingTable(message: string) {
  return /titan_prospect|marketing_spend|schema cache|does not exist/i.test(message);
}

const TYPE_LABELS: Record<ProspectType, string> = {
  apartment_complex: 'Apartment complex',
  dealership: 'Dealership',
  fleet_operator: 'Fleet operator',
  construction: 'Construction company',
  landscaping: 'Landscaping company',
  property_manager: 'Property manager',
  hoa: 'HOA',
  realtor: 'Realtor office',
  other: 'Business',
};

function inferProspectType(companyName: string, message: string): ProspectType {
  const hay = `${companyName} ${message}`.toLowerCase();
  if (/apartment|complex|resident|multifamily/.test(hay)) return 'apartment_complex';
  if (/dealership|dealer|auto group/.test(hay)) return 'dealership';
  if (/fleet|truck|commercial vehicle/.test(hay)) return 'fleet_operator';
  if (/construction|builder|contractor/.test(hay)) return 'construction';
  if (/landscap|lawn|mow/.test(hay)) return 'landscaping';
  if (/property manage|pm company/.test(hay)) return 'property_manager';
  if (/hoa|homeowner/.test(hay)) return 'hoa';
  if (/realtor|real estate|broker/.test(hay)) return 'realtor';
  return 'fleet_operator';
}

export function estimateMonthlyCents(type: ProspectType, fleetSize: number | null): number {
  const perVehicle = 12000;
  if (fleetSize && fleetSize > 0) return fleetSize * perVehicle;
  const defaults: Record<ProspectType, number> = {
    apartment_complex: 240000,
    dealership: 180000,
    fleet_operator: 320000,
    construction: 150000,
    landscaping: 120000,
    property_manager: 200000,
    hoa: 90000,
    realtor: 60000,
    other: 80000,
  };
  return defaults[type];
}

export function buildScoreReason(type: ProspectType, fleetSize: number | null, distance: number | null): string {
  const parts: string[] = [];
  if (type === 'apartment_complex') parts.push('Multiple resident vehicles + high visibility');
  else if (type === 'fleet_operator') parts.push('Recurring fleet maintenance potential');
  else if (type === 'property_manager') parts.push('Multi-location contract opportunity');
  else parts.push('B2B service contract fit');
  if (fleetSize && fleetSize >= 5) parts.push(`${fleetSize} vehicles flagged`);
  if (distance != null && distance < 5) parts.push('Close to service area');
  return parts.join(' · ');
}

export function computeScore(type: ProspectType, monthlyCents: number, distance: number | null, status: string): number {
  const typeBoost: Record<ProspectType, number> = {
    fleet_operator: 22,
    apartment_complex: 20,
    property_manager: 18,
    dealership: 16,
    construction: 12,
    landscaping: 12,
    hoa: 10,
    realtor: 8,
    other: 5,
  };
  let score = 45 + (typeBoost[type] ?? 5);
  if (monthlyCents >= 250000) score += 18;
  else if (monthlyCents >= 120000) score += 10;
  if (distance != null && distance < 3) score += 12;
  else if (distance != null && distance < 8) score += 6;
  if (status === 'new') score += 5;
  return Math.min(99, Math.max(1, score));
}

export function mapProspect(row: Record<string, unknown>): TitanProspect {
  return {
    id: str(row.id),
    companyName: str(row.company_name),
    prospectType: str(row.prospect_type) as ProspectType,
    contactName: str(row.contact_name) || null,
    contactRole: str(row.contact_role) || null,
    decisionMakerTitle: str(row.decision_maker_title) || str(row.contact_role) || null,
    email: str(row.email) || null,
    phone: str(row.phone) || null,
    website: str(row.website) || null,
    address: str(row.address) || null,
    distanceMiles: row.distance_miles != null ? Number(row.distance_miles) : null,
    estimatedMonthlyCents: cents(row.estimated_monthly_cents),
    vehicleCount: row.vehicle_count != null ? Number(row.vehicle_count) : null,
    score: Number(row.score ?? 0),
    scoreReason: str(row.score_reason) || null,
    status: str(row.status) || 'new',
    source: str(row.source) || 'manual',
    acquisitionSource: str(row.acquisition_source) || null,
    notes: str(row.notes) || str(row.enrichment_notes) || null,
    leadId: str(row.lead_id) || null,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    googlePlaceId: str(row.google_place_id) || null,
    discoveredAt: str(row.discovered_at) || null,
  };
}

export async function syncFleetInquiriesToProspects(admin: SupabaseClient): Promise<number> {
  const probe = await admin.from('titan_prospects').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return 0;

  const { data: inquiries } = await admin
    .from('fleet_inquiries')
    .select('id, company_name, contact_name, email, phone, fleet_size, message, status')
    .in('status', ['new', 'contacted'])
    .limit(100);

  let synced = 0;
  const now = new Date().toISOString();

  for (const row of inquiries ?? []) {
    const r = row as Record<string, unknown>;
    const fleetInquiryId = str(r.id);
    const { data: existing } = await admin.from('titan_prospects').select('id').eq('fleet_inquiry_id', fleetInquiryId).maybeSingle();
    if (existing?.id) continue;

    const company = str(r.company_name) || 'Fleet inquiry';
    const type = inferProspectType(company, str(r.message));
    const fleetSize = r.fleet_size != null ? Number(r.fleet_size) : null;
    const monthly = estimateMonthlyCents(type, fleetSize);
    const score = computeScore(type, monthly, null, 'new');
    const scoreReason = buildScoreReason(type, fleetSize, null);

    const { error } = await admin.from('titan_prospects').insert({
      company_name: company,
      prospect_type: type,
      contact_name: str(r.contact_name) || null,
      contact_role: type === 'property_manager' ? 'Property Manager' : 'Fleet Manager',
      email: str(r.email) || null,
      phone: str(r.phone) || null,
      estimated_monthly_cents: monthly,
      vehicle_count: fleetSize,
      score,
      score_reason: scoreReason,
      status: 'new',
      source: 'fleet_inquiry',
      fleet_inquiry_id: fleetInquiryId,
      created_at: now,
      updated_at: now,
    });
    if (!error) synced += 1;
  }

  return synced;
}

export async function loadLeadRadar(admin: SupabaseClient): Promise<{
  prospects: TitanProspect[];
  tablesReady: boolean;
  discovery: DiscoverySummary;
}> {
  const probe = await admin.from('titan_prospects').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { prospects: [], tablesReady: false, discovery: await loadDiscoverySummary(admin) };
  }

  await syncFleetInquiriesToProspects(admin);

  const [discovery, prospectsRes] = await Promise.all([
    loadDiscoverySummary(admin),
    admin
      .from('titan_prospects')
      .select('*')
      .not('status', 'in', '("won","lost")')
      .order('score', { ascending: false })
      .limit(40),
  ]);

  return {
    prospects: (prospectsRes.data ?? []).map((r) => mapProspect(r as Record<string, unknown>)),
    tablesReady: true,
    discovery,
  };
}

export function prospectTypeLabel(type: ProspectType) {
  return TYPE_LABELS[type] ?? type;
}

export async function addProspect(
  admin: SupabaseClient,
  input: {
    companyName: string;
    prospectType: ProspectType;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    distanceMiles?: number;
    vehicleCount?: number;
  },
) {
  const monthly = estimateMonthlyCents(input.prospectType, input.vehicleCount ?? null);
  const score = computeScore(input.prospectType, monthly, input.distanceMiles ?? null, 'new');
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('titan_prospects')
    .insert({
      company_name: input.companyName,
      prospect_type: input.prospectType,
      contact_name: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      distance_miles: input.distanceMiles ?? null,
      vehicle_count: input.vehicleCount ?? null,
      estimated_monthly_cents: monthly,
      score,
      score_reason: buildScoreReason(input.prospectType, input.vehicleCount ?? null, input.distanceMiles ?? null),
      status: 'new',
      source: 'manual',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, id: str(data?.id) };
}

export async function promoteProspectToPipeline(admin: SupabaseClient, prospectId: string) {
  const { data: prospect } = await admin.from('titan_prospects').select('*').eq('id', prospectId).maybeSingle();
  if (!prospect) return { ok: false as const, error: 'Prospect not found' };

  const p = prospect as Record<string, unknown>;
  const now = new Date().toISOString();
  const { data: lead, error } = await admin
    .from('leads')
    .insert({
      name: str(p.contact_name) || str(p.company_name),
      email: str(p.email) || null,
      phone: str(p.phone) || null,
      address: str(p.address) || null,
      notes: `Titan Lead Radar · ${prospectTypeLabel(str(p.prospect_type) as ProspectType)} · Score ${p.score}`,
      lead_source: 'titan_radar',
      marketing_channel: 'b2b_outreach',
      status: 'new',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };

  await admin
    .from('titan_prospects')
    .update({ status: 'pipeline', lead_id: lead?.id, updated_at: now })
    .eq('id', prospectId);

  return { ok: true as const, leadId: str(lead?.id) };
}
