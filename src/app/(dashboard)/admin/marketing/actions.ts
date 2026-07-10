'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadFleetContracts, loadMarketingCampaigns, saveFleetContracts, saveMarketingCampaigns } from '@/lib/business-modules';
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
): Promise<{ ok?: boolean; sent?: number; skipped?: number; error?: string; details?: string }> {
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
    details: result.errors.length ? result.errors.join('; ') : undefined,
  };
}
