'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadFleetContracts, loadMarketingCampaigns, saveFleetContracts, saveMarketingCampaigns, type MarketingCampaign } from '@/lib/business-modules';
import { executeMarketingCampaign } from '@/lib/marketing/campaign-sender';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function saveFleetContractsAction(formData: FormData) {
  const g = await gate();
  if (!g) return;
  const raw = String(formData.get('contracts') ?? '[]');
  try {
    const contracts = JSON.parse(raw) as Parameters<typeof saveFleetContracts>[1];
    await saveFleetContracts(g.admin, contracts);
    revalidatePath('/admin/fleet');
    revalidatePath('/admin/marketing');
  } catch (e) {
    console.warn('[marketing] saveFleetContracts', e);
  }
}

export async function saveMarketingCampaignsAction(formData: FormData) {
  const g = await gate();
  if (!g) return;
  const raw = String(formData.get('campaigns') ?? '[]');
  try {
    const campaigns = JSON.parse(raw) as Parameters<typeof saveMarketingCampaigns>[1];
    await saveMarketingCampaigns(g.admin, campaigns);
    revalidatePath('/admin/marketing');
  } catch (e) {
    console.warn('[marketing] saveMarketingCampaigns', e);
  }
}

export async function loadMarketingModuleData() {
  const g = await gate();
  if (!g) return { campaigns: [], contracts: [] };
  const [campaigns, contracts] = await Promise.all([loadMarketingCampaigns(g.admin), loadFleetContracts(g.admin)]);
  return { campaigns, contracts };
}

export async function sendMarketingCampaignAction(
  campaignId: string,
): Promise<{ ok?: boolean; sent?: number; skipped?: number; excluded?: number; error?: string; details?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };

  const campaigns = await loadMarketingCampaigns(g.admin);
  const idx = campaigns.findIndex((c) => c.id === campaignId);
  if (idx < 0) return { error: 'Campaign not found' };

  const campaign = campaigns[idx];
  if (!campaign.message.trim()) return { error: 'Add a message before sending.' };

  const result = await executeMarketingCampaign(g.admin, campaign);
  if (!result.ok && result.sent === 0) {
    return { error: result.errors[0] ?? 'Send failed', details: result.errors.join('; ') };
  }

  campaigns[idx] = {
    ...campaign,
    status: 'sent',
    sentCount: campaign.sentCount + result.sent,
    scheduledAt: campaign.scheduledAt ?? new Date().toISOString(),
  };
  await saveMarketingCampaigns(g.admin, campaigns);
  revalidatePath('/admin/marketing');
  return {
    ok: true,
    sent: result.sent,
    skipped: result.skipped,
    excluded: result.excluded,
    details: result.errors.length ? result.errors.join('; ') : undefined,
  };
}

export async function generateCampaignIdeasAction(): Promise<{ ideas: MarketingCampaign[]; error?: string }> {
  const g = await gate();
  if (!g) return { ideas: [], error: 'Unauthorized' };
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 86400_000).toISOString();
  const sixtyDaysAgo = new Date(now - 60 * 86400_000).toISOString();
  const oneEightyDaysAgo = new Date(now - 180 * 86400_000).toISOString();
  const [recentJobs, olderJobs, customerCount, quickRefresh, activePromos] = await Promise.all([
    g.admin.from('appointments').select('customer_id, guest_email, base_price_cents, booking_vehicles, service_slug').eq('status', 'completed').gte('job_completed_at', thirtyDaysAgo).limit(500),
    g.admin.from('appointments').select('customer_id, guest_email, base_price_cents, service_slug, job_completed_at').eq('status', 'completed').gte('job_completed_at', oneEightyDaysAgo).lte('job_completed_at', sixtyDaysAgo).limit(500),
    g.admin.from('customers').select('id', { count: 'exact', head: true }),
    g.admin.from('services').select('slug, title, service_prices(price_cents, vehicle_class)').or('slug.eq.quick-refresh,title.ilike.%Quick Refresh%').eq('active', true).limit(1).maybeSingle(),
    g.admin.from('promo_codes').select('code, ends_at').eq('enabled', true).eq('archived', false).limit(10),
  ]);
  const uniqueCount = (rows: Array<Record<string, unknown>>) => new Set(rows.map((row) => String(row.customer_id ?? row.guest_email ?? '')).filter(Boolean)).size;
  const recentRows = (recentJobs.data ?? []) as Record<string, unknown>[];
  const olderRows = (olderJobs.data ?? []) as Record<string, unknown>[];
  const recentCount = uniqueCount(recentRows);
  const lapsedCount = uniqueCount(olderRows);
  const twoCarCount = uniqueCount(recentRows.filter((row) => Array.isArray(row.booking_vehicles) && row.booking_vehicles.length >= 2));
  const quickRow = quickRefresh.data as Record<string, unknown> | null;
  const quickPrices = Array.isArray(quickRow?.service_prices) ? quickRow.service_prices as Record<string, unknown>[] : [];
  const quickPrice = Number(quickPrices.find((price) => String(price.vehicle_class) === 'sedan')?.price_cents ?? quickPrices[0]?.price_cents ?? 0) || null;
  const promo = (activePromos.data?.[0] as { code?: string; ends_at?: string | null } | undefined) ?? null;
  const bookingLink = `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com').replace(/\/$/, '')}/book`;
  const recommendedSendAt = new Date(now + 24 * 60 * 60_000).toISOString();
  const expiresAt = promo?.ends_at ?? new Date(now + 14 * 86400_000).toISOString();
  const make = (input: { name: string; audience: string; count: number; reason: string; offer: string; message: string; price?: number | null; subject: string; social: string }): MarketingCampaign => ({
    id: crypto.randomUUID(), name: input.name, channel: 'both', audience: input.audience, message: input.message,
    scheduledAt: null, status: 'draft', sentCount: 0, createdAt: new Date().toISOString(),
    intelligence: {
      reason: input.reason,
      estimatedRecipientCount: input.count,
      offer: input.offer,
      recommendedPriceCents: input.price ?? null,
      projectedRevenueCents: Math.round(input.count * (input.price ?? 0) * 0.12),
      marginWarning: input.price ? 'Confirm labor time, travel, and add-on exclusions before sending.' : 'Configure an active service price before publishing this offer.',
      emailSubject: input.subject,
      socialCaption: input.social,
      recommendedSendAt,
      expiresAt,
      bookingLink,
      promoCode: promo?.code ?? null,
    },
  });
  const ideas = [
    make({ name: 'Quick Refresh campaign', audience: `Customers served in the last 30 days (${recentCount} estimated)`, count: recentCount, reason: 'Recent customers are the best fit for a maintenance refresh before the vehicle needs another deep detail.', offer: quickPrice ? `Gloss Boss Quick Refresh from $${(quickPrice / 100).toFixed(0)}` : 'Gloss Boss Quick Refresh — price must be configured', price: quickPrice, subject: 'Keep that fresh-detail look going', message: `Hi {name}, your vehicle may be ready for a Gloss Boss Quick Refresh. See live pricing and openings: ${bookingLink}`, social: `Keep the fresh-detail look going with a Gloss Boss Quick Refresh. Book: ${bookingLink}` }),
    make({ name: 'Lapsed customer reactivation', audience: `Completed service 60–180 days ago with no recent visit (${lapsedCount} estimated)`, count: lapsedCount, reason: 'These customers have prior purchase history but are outside the recent-service window.', offer: promo?.code ? `Active offer ${promo.code}` : 'Return-customer opening', subject: 'Ready for your next detail?', message: `Hi {name}, it may be time for your next Gloss Boss detail. Check current openings here: ${bookingLink}`, social: `Been a while since your last detail? Mobile appointments are open: ${bookingLink}` }),
    make({ name: 'Two-car household special', audience: `Known multi-vehicle households (${twoCarCount} estimated)`, count: twoCarCount, reason: 'Prior multi-vehicle bookings indicate a strong fit for a household bundle.', offer: 'Use the configured multi-car discount', subject: 'Detail both vehicles in one visit', message: `Hi {name}, save a second trip and schedule both household vehicles together. See the live multi-car price: ${bookingLink}`, social: `Two vehicles, one mobile visit. See live multi-car pricing: ${bookingLink}` }),
    make({ name: 'Referral push', audience: `All eligible customers (${customerCount.count ?? 0} estimated)`, count: customerCount.count ?? 0, reason: 'Existing customers can create qualified word-of-mouth demand using their personal referral link.', offer: 'Configured referral give/get reward', subject: 'Give a friend a cleaner ride', message: 'Hi {name}, your referral reward is waiting in your customer dashboard. Share your link with a friend and you both benefit.', social: 'Love your shine? Share Gloss Boss ATX with a friend from your customer dashboard.' }),
  ];
  return { ideas: ideas.filter((idea) => (idea.intelligence?.estimatedRecipientCount ?? 0) > 0) };
}
