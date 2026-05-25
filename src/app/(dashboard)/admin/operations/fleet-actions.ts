'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { DEFAULT_FLEET_PRICING, type FleetPricingConfig } from '@/lib/fleet-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function fleetPricingFromForm(formData: FormData): FleetPricingConfig {
  const pick = (name: keyof FleetPricingConfig) =>
    String(formData.get(name) ?? '').trim() || DEFAULT_FLEET_PRICING[name];
  return {
    smallLabel: pick('smallLabel'),
    smallDetail: pick('smallDetail'),
    mediumLabel: pick('mediumLabel'),
    mediumDetail: pick('mediumDetail'),
    largeLabel: pick('largeLabel'),
    largeDetail: pick('largeDetail'),
    weeklyDiscount: pick('weeklyDiscount'),
    biweeklyDiscount: pick('biweeklyDiscount'),
    monthlyDiscount: pick('monthlyDiscount'),
    commercialNotes: pick('commercialNotes'),
  };
}

export async function setFleetPricingAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return;

  const pricing = fleetPricingFromForm(formData);
  const now = new Date().toISOString();
  await admin.from('site_settings').upsert(
    { key: 'fleet_pricing', value: JSON.stringify(pricing), updated_at: now },
    { onConflict: 'key' },
  );
  revalidatePath('/admin/operations');
  revalidatePath('/services');
}

export async function setFleetServicesSettingAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return;

  const enabled = formData.get('fleetEnabled') === 'on';
  const blurb = String(formData.get('fleetBlurb') ?? '').trim();
  const now = new Date().toISOString();

  await admin.from('site_settings').upsert(
    { key: 'fleet_services_enabled', value: enabled ? 'true' : 'false', updated_at: now },
    { onConflict: 'key' },
  );
  await admin.from('site_settings').upsert(
    { key: 'fleet_services_blurb', value: blurb || 'Fleet, dealership, and business accounts — call for volume pricing and on-site schedules.', updated_at: now },
    { onConflict: 'key' },
  );

  revalidatePath('/admin/operations');
  revalidatePath('/services');
}
