import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertSiteSetting } from '@/lib/site-settings-upsert';

export type FleetContract = {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  vehicleCount: number;
  monthlyBillingCents: number;
  routeNotes: string;
  renewalDate: string;
  status: 'active' | 'draft' | 'expired' | 'paused';
  createdAt: string;
};

export type MarketingCampaign = {
  id: string;
  name: string;
  channel: 'email' | 'sms' | 'social' | 'referral' | 'both';
  audience: string;
  message: string;
  scheduledAt: string | null;
  status: 'draft' | 'scheduled' | 'sent' | 'paused';
  sentCount: number;
  createdAt: string;
  intelligence?: {
    reason: string;
    estimatedRecipientCount: number;
    offer: string;
    recommendedPriceCents: number | null;
    projectedRevenueCents: number;
    marginWarning: string | null;
    emailSubject: string;
    socialCaption: string;
    recommendedSendAt: string;
    expiresAt: string | null;
    bookingLink: string;
    promoCode: string | null;
  };
};

const FLEET_KEY = 'fleet_contracts';
const MARKETING_KEY = 'marketing_campaigns';

function parseJsonArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function loadFleetContracts(admin: SupabaseClient): Promise<FleetContract[]> {
  const { data } = await admin.from('site_settings').select('value').eq('key', FLEET_KEY).maybeSingle();
  return parseJsonArray<FleetContract>(data?.value);
}

export async function saveFleetContracts(admin: SupabaseClient, contracts: FleetContract[]): Promise<void> {
  await upsertSiteSetting(admin, { key: FLEET_KEY, value: JSON.stringify(contracts) });
}

export async function loadMarketingCampaigns(admin: SupabaseClient): Promise<MarketingCampaign[]> {
  const { data } = await admin.from('site_settings').select('value').eq('key', MARKETING_KEY).maybeSingle();
  return parseJsonArray<MarketingCampaign>(data?.value);
}

export async function saveMarketingCampaigns(admin: SupabaseClient, campaigns: MarketingCampaign[]): Promise<void> {
  await upsertSiteSetting(admin, { key: MARKETING_KEY, value: JSON.stringify(campaigns) });
}

export function newFleetContract(partial: Partial<FleetContract> = {}): FleetContract {
  return {
    id: crypto.randomUUID(),
    companyName: partial.companyName ?? '',
    contactName: partial.contactName ?? '',
    contactEmail: partial.contactEmail ?? '',
    contactPhone: partial.contactPhone ?? '',
    vehicleCount: partial.vehicleCount ?? 0,
    monthlyBillingCents: partial.monthlyBillingCents ?? 0,
    routeNotes: partial.routeNotes ?? '',
    renewalDate: partial.renewalDate ?? new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    status: partial.status ?? 'draft',
    createdAt: new Date().toISOString(),
  };
}

export function newMarketingCampaign(partial: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return {
    id: crypto.randomUUID(),
    name: partial.name ?? 'New campaign',
    channel: partial.channel ?? 'email',
    audience: partial.audience ?? 'Active customers',
    message: partial.message ?? '',
    scheduledAt: partial.scheduledAt ?? null,
    status: partial.status ?? 'draft',
    sentCount: partial.sentCount ?? 0,
    createdAt: new Date().toISOString(),
  };
}
