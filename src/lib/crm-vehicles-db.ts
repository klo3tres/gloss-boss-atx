import type { SupabaseClient } from '@supabase/supabase-js';

export type CrmVehicleRow = {
  id: string;
  customer_id: string;
  description: string;
  notes: string | null;
  created_at: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

type VehicleTable = 'vehicles' | 'customer_vehicles';

async function detectVehicleTable(admin: SupabaseClient): Promise<VehicleTable> {
  const probe = await admin.from('vehicles').select('id').limit(1);
  if (!probe.error) return 'vehicles';
  const probe2 = await admin.from('customer_vehicles').select('id').limit(1);
  if (!probe2.error) return 'customer_vehicles';
  return 'vehicles';
}

function normalizeRow(raw: Record<string, unknown>): CrmVehicleRow {
  const notes = str(raw.notes) || null;
  let description = str(raw.description);
  if (!description && notes) {
    try {
      const n = JSON.parse(notes) as { display?: string };
      if (n.display) description = str(n.display);
    } catch {
      const firstLine = notes.split('\n')[0]?.trim();
      if (firstLine && !firstLine.startsWith('{')) description = firstLine;
    }
  }
  return {
    id: str(raw.id),
    customer_id: str(raw.customer_id),
    description: description || 'Vehicle',
    notes,
    created_at: str(raw.created_at),
  };
}

export async function listCustomerVehicles(admin: SupabaseClient, customerId: string): Promise<CrmVehicleRow[]> {
  const table = await detectVehicleTable(admin);
  let res = await admin.from(table).select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
  if (res.error) {
    res = await admin.from(table).select('id, customer_id, notes, created_at').eq('customer_id', customerId);
  }
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as Record<string, unknown>[]).map((r) => normalizeRow(r));
}

export async function insertCustomerVehicle(
  admin: SupabaseClient,
  params: { customerId: string; description: string; notes: string },
): Promise<{ id: string }> {
  const table = await detectVehicleTable(admin);
  const base = { customer_id: params.customerId, description: params.description, notes: params.notes };

  let ins = await admin.from(table).insert(base).select('id').maybeSingle();
  if (ins.error && /description|schema cache/i.test(ins.error.message)) {
    ins = await admin
      .from(table)
      .insert({
        customer_id: params.customerId,
        notes: JSON.stringify({ display: params.description, meta: params.notes }),
      })
      .select('id')
      .maybeSingle();
  }
  if (ins.error) throw new Error(ins.error.message);
  return { id: str((ins.data as { id?: string } | null)?.id) };
}

export async function updateCustomerVehicle(
  admin: SupabaseClient,
  params: { customerId: string; vehicleId: string; description: string; notes: string },
): Promise<void> {
  const table = await detectVehicleTable(admin);
  let up = await admin
    .from(table)
    .update({ description: params.description, notes: params.notes })
    .eq('id', params.vehicleId)
    .eq('customer_id', params.customerId);
  if (up.error && /description|schema cache/i.test(up.error.message)) {
    up = await admin
      .from(table)
      .update({ notes: JSON.stringify({ display: params.description, meta: params.notes }) })
      .eq('id', params.vehicleId)
      .eq('customer_id', params.customerId);
  }
  if (up.error) throw new Error(up.error.message);
}
