import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { DEFAULT_FLEET_PRICING, parseFleetPricing } from '@/lib/fleet-pricing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { setFleetPricingAction, setFleetServicesSettingAction } from '../operations/fleet-actions';
import { FleetInboxClient } from '@/components/admin/fleet-inbox-client';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

export default async function AdminFleetPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [settingsRes, inquiriesRes, profilesRes] = await Promise.all([
    admin.from('site_settings').select('key, value').in('key', ['fleet_services_enabled', 'fleet_services_blurb', 'fleet_pricing']).limit(10),
    admin.from('fleet_inquiries').select('*').order('created_at', { ascending: false }).limit(150),
    admin.from('profiles').select('id, full_name, email, role').order('full_name', { ascending: true }),
  ]);

  const settings = (settingsRes.data ?? []) as Record<string, unknown>[];
  const fleetEnabled = settings.some((r) => r.key === 'fleet_services_enabled' && String(r.value).toLowerCase() === 'true');
  const fleetBlurb = String(settings.find((r) => r.key === 'fleet_services_blurb')?.value ?? '');
  const pricingRaw = settings.find((r) => r.key === 'fleet_pricing')?.value;
  let fleetPricing = { ...DEFAULT_FLEET_PRICING };
  try {
    fleetPricing = parseFleetPricing(typeof pricingRaw === 'string' ? JSON.parse(pricingRaw) : pricingRaw);
  } catch {
    fleetPricing = { ...DEFAULT_FLEET_PRICING };
  }

  const inquiries = (inquiriesRes.data ?? []).map((row: any) => ({
    id: row.id,
    company_name: row.company_name,
    contact_name: row.contact_name,
    email: row.email,
    phone: row.phone,
    fleet_size: row.fleet_size,
    message: row.message,
    status: row.status || 'new',
    created_at: row.created_at,
    internal_notes: row.internal_notes,
    quote_amount_cents: row.quote_amount_cents,
    quoted_services: row.quoted_services,
    follow_up_date: row.follow_up_date,
    contact_history: row.contact_history,
    assigned_technician_id: row.assigned_technician_id,
  }));

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const technicians = profiles.filter((p) => p.role === 'technician' || p.role === 'admin' || p.role === 'super_admin');

  async function savePricing(formData: FormData) {
    'use server';
    await setFleetPricingAction(formData);
  }

  async function saveVisibility(formData: FormData) {
    'use server';
    await setFleetServicesSettingAction(formData);
  }

  return (
    <DashboardShell title='Fleet accounts' subtitle='Public fleet sales settings, pricing tiers, and business inquiry follow-up.' role='admin'>
      {inquiriesRes.error ? (
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Fleet inquiries could not load: {inquiriesRes.error.message}.
        </p>
      ) : null}

      <FleetInboxClient
        initialInquiries={inquiries}
        technicians={technicians}
        fleetPricing={fleetPricing}
        fleetEnabled={fleetEnabled}
        fleetBlurb={fleetBlurb}
        savePricingAction={savePricing}
        saveVisibilityAction={saveVisibility}
      />
    </DashboardShell>
  );
}
