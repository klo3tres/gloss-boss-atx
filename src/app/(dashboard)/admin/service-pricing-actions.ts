'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { applyCanonicalPriceSheet, ensureCanonicalServiceCatalog } from '@/lib/admin/ensure-canonical-service-catalog';
import { filterServicePriceRowsForAdminUi } from '@/lib/admin/filter-ui-price-rows';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionFailure, actionSuccess, type ActionResponse } from '@/lib/action-response';

const SERVICE_ROLE_MSG = 'SUPABASE_SERVICE_ROLE_KEY missing. Cannot save admin pricing.';

export type SavedPriceRow = {
  id: string;
  slug: string;
  title: string;
  vehicle_class: string;
  price_cents: number;
};

export type PriceSaveResult = {
  priceId: string;
  savedCents: number;
  clientUsed: 'service_role';
  verifiedRow: SavedPriceRow;
  syncedRowIds: string[];
};

export type ApplySheetResult = {
  clientUsed: 'service_role';
  rows: SavedPriceRow[];
};

function requireAdminClient(): ActionResponse<{ admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>> }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return actionFailure(SERVICE_ROLE_MSG, {
      client: 'none',
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  }
  console.info('[admin/pricing] using Supabase service_role client');
  return actionSuccess({ admin });
}

async function authGate(): Promise<ActionResponse<{ userId: string }>> {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return actionFailure('Unauthorized');
  }
  return actionSuccess({ userId: session.user.id });
}

async function fetchCatalogRows(admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>): Promise<SavedPriceRow[]> {
  const { data: rows, error } = await admin
    .from('service_prices')
    .select('id, vehicle_class, price_cents, services ( title, slug )')
    .order('vehicle_class', { ascending: true });
  if (error) throw new Error(error.message);
  return filterServicePriceRowsForAdminUi((rows ?? []) as Parameters<typeof filterServicePriceRowsForAdminUi>[0]).map((row) => {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    return {
      id: row.id,
      slug: typeof svc?.slug === 'string' ? svc.slug : '',
      title: typeof svc?.title === 'string' ? svc.title : '',
      vehicle_class: row.vehicle_class,
      price_cents: row.price_cents,
    };
  });
}

/** Sync suv + suv_truck duplicate rows so booking and admin UI stay aligned. */
async function syncSiblingPriceRows(
  admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>,
  priceId: string,
  cents: number,
): Promise<string[]> {
  const { data: base, error } = await admin
    .from('service_prices')
    .select('id, service_id, vehicle_class')
    .eq('id', priceId)
    .maybeSingle();
  if (error || !base) return [];

  const vc = String(base.vehicle_class ?? '');
  const siblings =
    vc === 'suv' || vc === 'suv_truck'
      ? ['suv', 'suv_truck']
      : vc === 'truck'
        ? ['truck']
        : vc === 'sedan'
          ? ['sedan']
          : [vc];

  const { data: related } = await admin
    .from('service_prices')
    .select('id')
    .eq('service_id', base.service_id)
    .in('vehicle_class', siblings);

  const ids = (related ?? []).map((r) => String((r as { id: string }).id));
  if (ids.length === 0) return [];

  const { error: upErr } = await admin.from('service_prices').update({ price_cents: cents }).in('id', ids);
  if (upErr) throw new Error(upErr.message);
  return ids;
}

export async function updateServicePriceCentsAction(formData: FormData): Promise<ActionResponse<PriceSaveResult>> {
  const auth = await authGate();
  if (!auth.ok) return auth;

  const priceId = String(formData.get('priceId') ?? '').trim();
  const rawStr = String(formData.get('priceDollars') ?? '').trim();
  const raw = rawStr === '' ? 0 : Number(rawStr);
  if (!priceId || !Number.isFinite(raw) || raw < 0) {
    return actionFailure('Invalid price');
  }

  const gate = requireAdminClient();
  if (!gate.ok) return gate;
  const { admin } = gate.data;

  const cents = Math.round(raw * 100);
  let syncedRowIds: string[] = [];
  try {
    syncedRowIds = await syncSiblingPriceRows(admin, priceId, cents);
  } catch (e) {
    return actionFailure(e instanceof Error ? e.message : 'Could not sync related price rows', { priceId, cents });
  }

  if (syncedRowIds.length === 0) {
    return actionFailure(`No price row found for id ${priceId}. Refresh the page and try again.`, { priceId });
  }

  const { data: verified, error: readErr } = await admin
    .from('service_prices')
    .select('id, vehicle_class, price_cents, services ( title, slug )')
    .eq('id', priceId)
    .maybeSingle();

  if (readErr) return actionFailure(readErr.message, { priceId });
  if (!verified || verified.price_cents !== cents) {
    return actionFailure(
      `Update did not persist. Expected ${cents} cents, read ${verified?.price_cents ?? 'null'}.`,
      { priceId, expected: cents, actual: verified?.price_cents },
    );
  }

  const svc = Array.isArray(verified.services) ? verified.services[0] : verified.services;
  revalidatePath('/admin/services');
  revalidatePath('/book');
  revalidatePath('/api/services');
  revalidatePath('/api/public/site-data');

  return actionSuccess(
    {
      priceId,
      savedCents: cents,
      clientUsed: 'service_role',
      verifiedRow: {
        id: verified.id,
        slug: typeof svc?.slug === 'string' ? svc.slug : '',
        title: typeof svc?.title === 'string' ? svc.title : '',
        vehicle_class: verified.vehicle_class,
        price_cents: verified.price_cents,
      },
      syncedRowIds,
    },
    { priceId, cents, syncedCount: syncedRowIds.length },
  );
}

export async function applyCanonicalPriceSheetAction(): Promise<ActionResponse<ApplySheetResult>> {
  const auth = await authGate();
  if (!auth.ok) return auth;

  const gate = requireAdminClient();
  if (!gate.ok) return gate;
  const { admin } = gate.data;

  const seed = await ensureCanonicalServiceCatalog(admin);
  if (!seed.ok) return actionFailure(seed.error ?? 'Catalog seed failed');

  const r = await applyCanonicalPriceSheet(admin);
  if (!r.ok) return actionFailure(r.error ?? 'Apply sheet failed');

  let rows: SavedPriceRow[];
  try {
    rows = await fetchCatalogRows(admin);
  } catch (e) {
    return actionFailure(e instanceof Error ? e.message : 'Could not re-read catalog after apply');
  }

  if (rows.length === 0) {
    return actionFailure('Price sheet applied but catalog read back empty. Check services table.', { seed: seed.ok });
  }

  revalidatePath('/admin/services');
  revalidatePath('/book');
  revalidatePath('/api/public/site-data');

  return actionSuccess({ clientUsed: 'service_role', rows }, { rowCount: rows.length });
}

export async function updateServiceActiveAction(formData: FormData): Promise<ActionResponse<{ serviceId: string; active: boolean }>> {
  const auth = await authGate();
  if (!auth.ok) return auth;

  const serviceId = String(formData.get('serviceId') ?? '').trim();
  const active = String(formData.get('active') ?? '') === 'true';
  if (!serviceId) return actionFailure('Missing service');

  const gate = requireAdminClient();
  if (!gate.ok) return gate;
  const { admin } = gate.data;

  const { data, error } = await admin.from('services').update({ active }).eq('id', serviceId).select('id, active').maybeSingle();
  if (error) return actionFailure(error.message);
  if (!data) return actionFailure('Service row not found');

  revalidatePath('/admin/services');
  revalidatePath('/book');
  return actionSuccess({ serviceId, active: Boolean(data.active) });
}
