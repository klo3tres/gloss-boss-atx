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
  suv_truck_cents: number;
}> = [
  {
    slug: 'exterior-wash',
    title: 'Exterior Wash',
    subtitle: 'Premium maintenance wash package',
    sort_order: 10,
    sedan_cents: 6000,
    suv_truck_cents: 7500,
  },
  {
    slug: 'exterior-detail',
    title: 'Exterior Detail',
    subtitle: 'Clay, polish prep, wax or sealant protection',
    sort_order: 20,
    sedan_cents: 9000,
    suv_truck_cents: 11000,
  },
  {
    slug: 'interior-detail',
    title: 'Interior Detail',
    subtitle: 'Deep interior reset package',
    sort_order: 30,
    sedan_cents: 8000,
    suv_truck_cents: 10000,
  },
  {
    slug: 'full-detail',
    title: 'Full Detail',
    subtitle: 'Complete inside and outside detail',
    sort_order: 40,
    sedan_cents: 15000,
    suv_truck_cents: 17500,
  },
  {
    slug: 'ceramic-coating',
    title: 'Ceramic Coating',
    subtitle: 'Consultation and quote — long-term gloss protection',
    sort_order: 50,
    sedan_cents: 0,
    suv_truck_cents: 0,
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
          .update({ title: row.title, subtitle: row.subtitle, active: true, sort_order: row.sort_order })
          .eq('id', serviceId);
      }

      for (const tier of [
        { vehicle_class: 'sedan', cents: row.sedan_cents },
        { vehicle_class: 'suv_truck', cents: row.suv_truck_cents },
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
    return { ok: false, error: e instanceof Error ? e.message : 'ensure catalog failed' };
  }
}
