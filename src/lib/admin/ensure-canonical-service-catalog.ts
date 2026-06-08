import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Idempotent seed: canonical Gloss Boss services + sedan / suv_truck rows.
 * Uses admin/service-role client so RLS does not block.
 */
const ROWS: Array<{
  slug: string;
  title: string;
  subtitle: string;
  sort_order: number;
  sedan_cents: number;
  suv_cents: number;
  truck_cents: number;
  min_minutes: number;
  max_minutes: number;
  coming_soon?: boolean;
  quote_required?: boolean;
}> = [
  {
    slug: 'exterior-wash',
    title: 'Exterior Wash',
    subtitle: 'Premium maintenance wash package',
    sort_order: 10,
    sedan_cents: 7500,
    suv_cents: 10000,
    truck_cents: 12500,
    min_minutes: 60,
    max_minutes: 90,
  },
  {
    slug: 'exterior-detail',
    title: 'Exterior Detail',
    subtitle: 'Clay, polish prep, wax or sealant protection',
    sort_order: 20,
    sedan_cents: 13000,
    suv_cents: 15000,
    truck_cents: 17000,
    min_minutes: 120,
    max_minutes: 180,
  },
  {
    slug: 'interior-detail',
    title: 'Interior Detail',
    subtitle: 'Deep interior reset package',
    sort_order: 30,
    sedan_cents: 16500,
    suv_cents: 19500,
    truck_cents: 22500,
    min_minutes: 90,
    max_minutes: 150,
  },
  {
    slug: 'full-detail',
    title: 'Full Detail',
    subtitle: 'Complete inside and outside detail',
    sort_order: 40,
    sedan_cents: 22500,
    suv_cents: 25500,
    truck_cents: 27500,
    min_minutes: 180,
    max_minutes: 240,
  },
  {
    slug: 'ceramic-coating',
    title: 'Ceramic Coating',
    subtitle: 'Consultation and quote — long-term gloss protection',
    sort_order: 50,
    sedan_cents: 0,
    suv_cents: 0,
    truck_cents: 0,
    min_minutes: 1440,
    max_minutes: 2880,
    coming_soon: true,
    quote_required: true,
  },
];

export async function ensureCanonicalServiceCatalog(admin: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  try {
    for (const row of ROWS) {
      const { data: existing, error: selErr } = await admin.from('services').select('id').eq('slug', row.slug).maybeSingle();
      if (selErr) return { ok: false, error: selErr.message };

      let serviceId = existing?.id as string | undefined;
      if (!serviceId) {
        const ins = await admin
          .from('services')
          .insert({
            slug: row.slug,
            title: row.title,
            subtitle: row.subtitle,
            active: true,
            sort_order: row.sort_order,
            display_order: row.sort_order,
            estimated_min_minutes: row.min_minutes,
            estimated_max_minutes: row.max_minutes,
            coming_soon: row.coming_soon === true,
            quote_required: row.quote_required === true,
          })
          .select('id')
          .single();
        if (ins.error || !ins.data?.id) {
          return { ok: false, error: ins.error?.message ?? `insert service ${row.slug}` };
        }
        serviceId = ins.data.id as string;
      } else {
        await admin
          .from('services')
          .update({
            title: row.title,
            subtitle: row.subtitle,
            active: true,
            sort_order: row.sort_order,
            display_order: row.sort_order,
            estimated_min_minutes: row.min_minutes,
            estimated_max_minutes: row.max_minutes,
            coming_soon: row.coming_soon === true,
            quote_required: row.quote_required === true,
          })
          .eq('id', serviceId);
      }

      for (const tier of [
        { vehicle_class: 'sedan', cents: row.sedan_cents },
        { vehicle_class: 'suv', cents: row.suv_cents },
        { vehicle_class: 'truck', cents: row.truck_cents },
        { vehicle_class: 'suv_truck', cents: row.suv_cents },
      ] as const) {
        const { data: pr } = await admin
          .from('service_prices')
          .select('id')
          .eq('service_id', serviceId)
          .eq('vehicle_class', tier.vehicle_class)
          .maybeSingle();
        if (pr?.id) {
          /* Preserve admin-edited prices — only insert missing rows on seed. */
          continue;
        } else {
          await admin.from('service_prices').insert({
            service_id: serviceId,
            vehicle_class: tier.vehicle_class,
            price_cents: tier.cents,
          });
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'ensure catalog failed' };
  }
}

/** Force-apply canonical price sheet — overwrites standard package cents (not ceramic). */
export async function applyCanonicalPriceSheet(admin: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const seed = await ensureCanonicalServiceCatalog(admin);
  if (!seed.ok) return seed;
  try {
    for (const row of ROWS) {
      if (row.slug === 'ceramic-coating') continue;
      const { data: existing } = await admin.from('services').select('id').eq('slug', row.slug).maybeSingle();
      const serviceId = existing?.id as string | undefined;
      if (!serviceId) continue;
      for (const tier of [
        { vehicle_class: 'sedan', cents: row.sedan_cents },
        { vehicle_class: 'suv', cents: row.suv_cents },
        { vehicle_class: 'truck', cents: row.truck_cents },
        { vehicle_class: 'suv_truck', cents: row.suv_cents },
      ] as const) {
        const { data: pr } = await admin
          .from('service_prices')
          .select('id')
          .eq('service_id', serviceId)
          .eq('vehicle_class', tier.vehicle_class)
          .maybeSingle();
        if (pr?.id) {
          await admin.from('service_prices').update({ price_cents: tier.cents }).eq('id', pr.id);
        } else {
          await admin.from('service_prices').insert({
            service_id: serviceId,
            vehicle_class: tier.vehicle_class,
            price_cents: tier.cents,
          });
        }
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'apply sheet failed' };
  }
}
