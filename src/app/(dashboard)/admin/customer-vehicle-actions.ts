'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { insertCustomerVehicle, listCustomerVehicles, updateCustomerVehicle } from '@/lib/crm-vehicles-db';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { syncVehiclesForCustomerRecord } from '@/lib/crm-vehicle-sync';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';

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

  try {
    const { id } = await insertCustomerVehicle(g.admin, {
      customerId,
      description,
      notes: notesJson(year, make, model, color, vehicleClass),
    });
    const verified = await listCustomerVehicles(g.admin, customerId);
    const found = verified.some((v) => v.id === id);
    if (!found) return { ok: false as const, error: 'Vehicle saved but re-read failed.' };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Could not add vehicle' };
  }

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

  try {
    await updateCustomerVehicle(g.admin, {
      customerId,
      vehicleId,
      description: vehicleDescription(year, make, model, color),
      notes: archived ? `[archived] ${notesJson(year, make, model, color, vehicleClass)}` : notesJson(year, make, model, color, vehicleClass),
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : 'Could not update vehicle' };
  }

  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true as const };
}

export async function syncCapturedVehiclesAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const g = await gate();
  if (!g.ok) return actionErr(g.error);
  const customerId = str(formData.get('customerId'));
  if (!customerId) return actionErr('Missing customer.');
  const { inserted } = await syncVehiclesForCustomerRecord(g.admin, customerId);
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  revalidatePath('/dashboard');
  return actionOk(inserted > 0 ? `Synced ${inserted} vehicle(s) from appointments.` : 'No new vehicles to sync — CRM is up to date.');
}

export async function archiveCustomerVehicleAction(formData: FormData) {
  const fd = new FormData();
  for (const [k, v] of formData.entries()) fd.set(k, v);
  fd.set('archived', '1');
  return updateCustomerVehicleAction(fd);
}
