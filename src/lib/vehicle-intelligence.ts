import type { SupabaseClient } from '@supabase/supabase-js';
import { listCustomerVehicles, type CrmVehicleRow } from '@/lib/crm-vehicles-db';
import { displayMoney } from '@/lib/display-format';

export type VehicleServiceHistoryRow = {
  appointmentId: string;
  scheduledStart: string | null;
  serviceSlug: string;
  status: string;
  totalCents: number;
  paymentStatus: string | null;
  href: string;
};

export type VehicleIntelligenceBundle = {
  vehicle: CrmVehicleRow;
  customer: { id: string; fullName: string; email: string | null; phone: string | null };
  serviceHistory: VehicleServiceHistoryRow[];
  totalSpentCents: number;
  visitCount: number;
  lastServiceAt: string | null;
  recommendations: string[];
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function detectVehicleTable(admin: SupabaseClient): Promise<'vehicles' | 'customer_vehicles'> {
  const probe = await admin.from('vehicles').select('id').limit(1);
  if (!probe.error) return 'vehicles';
  return 'customer_vehicles';
}

export async function loadVehicleById(admin: SupabaseClient, vehicleId: string): Promise<CrmVehicleRow | null> {
  const table = await detectVehicleTable(admin);
  const { data } = await admin.from(table).select('*').eq('id', vehicleId).maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  let description = str(row.description);
  const notes = str(row.notes) || null;
  if (!description && notes) {
    try {
      const n = JSON.parse(notes) as { display?: string };
      if (n.display) description = str(n.display);
    } catch {
      const first = notes.split('\n')[0]?.trim();
      if (first && !first.startsWith('{')) description = first;
    }
  }
  return {
    id: str(row.id),
    customer_id: str(row.customer_id),
    description: description || 'Vehicle',
    notes,
    created_at: str(row.created_at),
  };
}

export async function loadVehicleIntelligence(admin: SupabaseClient, vehicleId: string): Promise<VehicleIntelligenceBundle | null> {
  const vehicle = await loadVehicleById(admin, vehicleId);
  if (!vehicle?.customer_id) return null;

  const { data: customer } = await admin
    .from('customers')
    .select('id, full_name, email, phone')
    .eq('id', vehicle.customer_id)
    .maybeSingle();
  if (!customer) return null;

  const descLower = vehicle.description.toLowerCase();
  const { data: appointments } = await admin
    .from('appointments')
    .select('id, scheduled_start, service_slug, status, base_price_cents, payment_status, vehicle_description, customer_id')
    .eq('customer_id', vehicle.customer_id)
    .order('scheduled_start', { ascending: false })
    .limit(100);

  const related = (appointments ?? []).filter((a) => {
    const row = a as Record<string, unknown>;
    const vd = str(row.vehicle_description).toLowerCase();
    if (!vd && appointments?.length === 1) return true;
    if (!vd) return false;
    return vd.includes(descLower) || descLower.includes(vd) || vd.split(' ')[0] === descLower.split(' ')[0];
  });

  const serviceHistory: VehicleServiceHistoryRow[] = related.map((a) => {
    const row = a as Record<string, unknown>;
    const id = str(row.id);
    return {
      appointmentId: id,
      scheduledStart: str(row.scheduled_start) || null,
      serviceSlug: str(row.service_slug) || 'service',
      status: str(row.status) || 'unknown',
      totalCents: Number(row.base_price_cents ?? 0) || 0,
      paymentStatus: str(row.payment_status) || null,
      href: `/admin/work-orders/${id}`,
    };
  });

  const totalSpentCents = serviceHistory.reduce((s, r) => s + r.totalCents, 0);
  const visitCount = serviceHistory.filter((r) => ['completed', 'deposit_paid', 'paid'].includes(r.status)).length;
  const lastServiceAt = serviceHistory.find((r) => r.scheduledStart)?.scheduledStart ?? null;

  const recommendations: string[] = [];
  if (visitCount >= 3) recommendations.push('Eligible for loyalty punch-card messaging and membership upsell.');
  if (lastServiceAt) {
    const days = Math.floor((Date.now() - new Date(lastServiceAt).getTime()) / 86400000);
    if (days > 90) recommendations.push(`No service in ${days} days — schedule rebook follow-up.`);
    else if (days > 45) recommendations.push('Approaching maintenance window — send seasonal detail reminder.');
  }
  if (totalSpentCents > 150000) recommendations.push(`High LTV vehicle (${displayMoney(totalSpentCents)}) — prioritize premium packages.`);

  const allCustomerVehicles = await listCustomerVehicles(admin, vehicle.customer_id);
  if (allCustomerVehicles.length > 1) recommendations.push(`${allCustomerVehicles.length} vehicles on file — bundle household pricing.`);

  return {
    vehicle,
    customer: {
      id: str(customer.id),
      fullName: str((customer as { full_name?: string }).full_name) || 'Customer',
      email: str((customer as { email?: string }).email) || null,
      phone: str((customer as { phone?: string }).phone) || null,
    },
    serviceHistory,
    totalSpentCents,
    visitCount,
    lastServiceAt,
    recommendations,
  };
}
