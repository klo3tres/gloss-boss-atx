'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false as const, error: 'Unauthorized' };
  }
  return { ok: true as const, admin };
}

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

function vehicleDescription(year: string, make: string, model: string, color: string) {
  const parts = [year, make, model].filter(Boolean);
  const base = parts.length ? parts.join(' ') : 'Vehicle';
  return color ? `${base} · ${color}` : base;
}

function notesJson(year: string, make: string, model: string, color: string, vehicleClass: string) {
  return JSON.stringify({ year, make, model, color, vehicle_class: vehicleClass });
}

export async function addCustomerVehicleAction(formData: FormData) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };

  const customerId = str(formData.get('customerId'));
  if (!customerId) return { ok: false as const, error: 'Missing customer' };

  const year = str(formData.get('year'));
  const make = str(formData.get('make'));
  const model = str(formData.get('model'));
  const color = str(formData.get('color'));
  const vehicleClass = str(formData.get('vehicleClass')) || 'sedan';
  const description = vehicleDescription(year, make, model, color);

  const { error } = await g.admin.from('vehicles').insert({
    customer_id: customerId,
    description,
    notes: notesJson(year, make, model, color, vehicleClass),
  });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/dashboard');
  return { ok: true as const };
}

export async function updateCustomerVehicleAction(formData: FormData) {
  const g = await gate();
  if (!g.ok) return { ok: false as const, error: g.error };

  const customerId = str(formData.get('customerId'));
  const vehicleId = str(formData.get('vehicleId'));
  if (!customerId || !vehicleId) return { ok: false as const, error: 'Missing ids' };

  const year = str(formData.get('year'));
  const make = str(formData.get('make'));
  const model = str(formData.get('model'));
  const color = str(formData.get('color'));
  const vehicleClass = str(formData.get('vehicleClass')) || 'sedan';
  const archived = str(formData.get('archived')) === '1';

  const patch: Record<string, unknown> = {
    description: vehicleDescription(year, make, model, color),
    notes: archived ? `[archived] ${notesJson(year, make, model, color, vehicleClass)}` : notesJson(year, make, model, color, vehicleClass),
  };

  const { error } = await g.admin.from('vehicles').update(patch).eq('id', vehicleId).eq('customer_id', customerId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true as const };
}

export async function archiveCustomerVehicleAction(formData: FormData) {
  const fd = new FormData();
  for (const [k, v] of formData.entries()) fd.set(k, v);
  fd.set('archived', '1');
  return updateCustomerVehicleAction(fd);
}
