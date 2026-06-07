import type { SupabaseClient } from '@supabase/supabase-js';
import { extractGallerySortRow, galleryInsertPayloadVariants, maxGallerySortFromRows } from '@/lib/gallery-normalize';

export async function dbDeleteGalleryImage(supabase: SupabaseClient, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing id' };
  const { error } = await supabase.from('gallery_images').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function dbToggleGalleryFeatured(
  supabase: SupabaseClient,
  id: string,
  featured: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing id' };
  try {
    const { error } = await supabase.from('gallery_images').update({ featured }).eq('id', id);
    if (error) return { ok: false, error: error.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
  return { ok: true };
}

export async function dbUpdateGalleryCaption(
  supabase: SupabaseClient,
  id: string,
  caption: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing id' };
  const cap = caption.trim() || null;
  const title = cap;
  try {
    const { error } = await supabase.from('gallery_images').update({ caption: cap, title }).eq('id', id);
    if (!error) return { ok: true };
    const { error: e2 } = await supabase.from('gallery_images').update({ caption: cap }).eq('id', id);
    if (e2) return { ok: false, error: e2.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
  return { ok: true };
}

export async function dbToggleGalleryPublished(
  supabase: SupabaseClient,
  id: string,
  published: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing id' };
  try {
    const { error } = await supabase.from('gallery_images').update({ published, active: published }).eq('id', id);
    if (!error) return { ok: true };
    const { error: e2 } = await supabase.from('gallery_images').update({ published }).eq('id', id);
    if (e2) return { ok: false, error: e2.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Update failed' };
  }
  return { ok: true };
}

export async function dbReorderGalleryBulk(supabase: SupabaseClient, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: false, error: 'No order' };
  let i = 0;
  for (const id of ids) {
    i += 10;
    try {
      const { error } = await supabase.from('gallery_images').update({ sort_order: i, order_index: i }).eq('id', id);
      if (error) {
        const { error: e2 } = await supabase.from('gallery_images').update({ sort_order: i }).eq('id', id);
        if (e2) return { ok: false, error: e2.message };
      }
    } catch (e) {
      console.warn('[gallery] bulk reorder', id, e);
    }
  }
  return { ok: true };
}

export async function dbReorderGalleryStep(
  supabase: SupabaseClient,
  id: string,
  direction: 'up' | 'down',
): Promise<{ ok: boolean; error?: string }> {
  let r1 = await supabase.from('gallery_images').select('*').order('sort_order', { ascending: true });
  if (r1.error && /sort_order|column .* does not exist|Could not find|schema cache/i.test(r1.error.message)) {
    r1 = await supabase.from('gallery_images').select('*').order('order_index', { ascending: true, nullsFirst: false });
  }
  if (r1.error && /order_index|column .* does not exist|Could not find|schema cache/i.test(r1.error.message)) {
    r1 = await supabase.from('gallery_images').select('*');
  }
  if (r1.error || !r1.data?.length) {
    return { ok: false, error: r1.error?.message ?? 'No rows' };
  }
  type Row = { id: string; sort_order: number; order_index: number | null };
  const list: Row[] = (r1.data as Record<string, unknown>[])
    .map((row) => extractGallerySortRow(row))
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return { ok: false, error: 'Not found' };
  const j = direction === 'up' ? idx - 1 : idx + 1;
  if (j < 0 || j >= list.length) return { ok: true };
  const a = list[idx];
  const b = list[j];
  const sortA = a.order_index ?? a.sort_order;
  const sortB = b.order_index ?? b.sort_order;
  const upA = await supabase.from('gallery_images').update({ order_index: sortB, sort_order: sortB }).eq('id', a.id);
  const upB = await supabase.from('gallery_images').update({ order_index: sortA, sort_order: sortA }).eq('id', b.id);
  if (upA.error || upB.error) {
    await supabase.from('gallery_images').update({ sort_order: sortB }).eq('id', a.id);
    await supabase.from('gallery_images').update({ sort_order: sortA }).eq('id', b.id);
  }
  return { ok: true };
}

export async function dbSaveFeaturedShowcase(supabase: SupabaseClient, raw: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Empty JSON' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'Invalid payload' };
  const slides = (parsed as { slides?: unknown }).slides;
  if (!Array.isArray(slides)) return { ok: false, error: 'Missing slides array' };
  const value = { slides: slides.slice(0, 12) };
  const iso = new Date().toISOString();

  const tryUpsert = async (row: Record<string, unknown>) =>
    supabase.from('homepage_content').upsert(row, { onConflict: 'key' });

  let row: Record<string, unknown> = { key: 'featured_showcase', value, updated_at: iso };
  let { error } = await tryUpsert(row);
  if (error && /updated_at|column .* does not exist|schema cache/i.test(error.message)) {
    row = { key: 'featured_showcase', value };
    ({ error } = await tryUpsert(row));
  }
  if (error && /homepage_content|relation .* does not exist|42501|permission denied/i.test(error.message)) {
    return {
      ok: false,
      code: 'TABLE_OR_POLICY',
      error:
        'Could not save to homepage_content. Confirm the table exists (migration 000012) and your account has admin/staff access in profiles.',
    };
  }
  if (error) {
    const { data: existing, error: selErr } = await supabase.from('homepage_content').select('id').eq('key', 'featured_showcase').maybeSingle();
    if (selErr) return { ok: false, error: selErr.message };
    if (existing?.id) {
      const up = await supabase
        .from('homepage_content')
        .update({ value, updated_at: iso })
        .eq('id', existing.id);
      if (up.error && /updated_at|column/i.test(up.error.message)) {
        const up2 = await supabase.from('homepage_content').update({ value }).eq('id', existing.id);
        if (up2.error) return { ok: false, error: up2.error.message };
        return { ok: true };
      }
      if (up.error) return { ok: false, error: up.error.message };
      return { ok: true };
    }
    const ins = await supabase.from('homepage_content').insert({ key: 'featured_showcase', value });
    if (ins.error) return { ok: false, error: ins.error.message };
    return { ok: true };
  }
  return { ok: true };
}

export async function dbAddGalleryImageFromUrl(
  supabase: SupabaseClient,
  imageUrl: string,
  caption: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!imageUrl) return { ok: false, error: 'Missing url' };
  const maxQ = await supabase.from('gallery_images').select('*').limit(500);
  if (maxQ.error) return { ok: false, error: maxQ.error.message };
  const nextOrder = maxGallerySortFromRows(maxQ.data ?? []) + 1;
  const variants = galleryInsertPayloadVariants(imageUrl, caption, nextOrder);
  for (const row of variants) {
    const { error: insErr } = await supabase.from('gallery_images').insert(row);
    if (!insErr) return { ok: true };
  }
  return { ok: false, error: 'Insert failed for all variants' };
}

export async function dbCreateBeforeAfterPost(
  supabase: SupabaseClient,
  params: {
    beforeUrl: string;
    afterUrl: string;
    vehicleLabel: string;
    serviceLabel: string;
    caption: string;
    watermark: boolean;
    published: boolean;
    jobId?: string;
    vehicleClass?: string;
    serviceCategory?: string;
    destination?: string;
    tags?: string[];
  }
): Promise<{ ok: boolean; error?: string }> {
  const maxQ = await supabase.from('gallery_images').select('*').limit(500);
  if (maxQ.error) return { ok: false, error: maxQ.error.message };
  const nextOrder = maxGallerySortFromRows(maxQ.data ?? []) + 10;

  const metadata = {
    transformation_phase: 'before_after',
    vehicle_label: params.vehicleLabel,
    service_label: params.serviceLabel,
    service_category: params.serviceCategory || null,
    before_url: params.beforeUrl,
    after_url: params.afterUrl,
    watermark: params.watermark,
    job_id: params.jobId || null,
    vehicle_class: params.vehicleClass || null,
    vehicle_type: params.vehicleClass || null,
    destination: params.destination || 'gallery',
    tags: params.tags || [],
  };
  const featured = params.destination === 'homepage featured' || params.destination === 'homepage_featured';

  const now = new Date().toISOString();
  const payload = {
    url: params.afterUrl,
    image_url: params.afterUrl,
    caption: params.caption.trim() || null,
    title: params.caption.trim() || null,
    sort_order: nextOrder,
    order_index: nextOrder,
    published: params.published,
    active: params.published,
    featured,
    watermark: params.watermark,
    vehicle_type: params.vehicleClass || null,
    service_category: params.serviceCategory || null,
    destination: params.destination || 'gallery',
    tags: params.tags || [],
    metadata,
    created_at: now,
  };

  const { error } = await supabase.from('gallery_images').insert(payload);
  if (error) {
    const payloadWithoutWatermark = {
      url: params.afterUrl,
      image_url: params.afterUrl,
      caption: params.caption.trim() || null,
      title: params.caption.trim() || null,
      sort_order: nextOrder,
      order_index: nextOrder,
      published: params.published,
      active: params.published,
      featured,
      metadata,
      created_at: now,
    };
    const { error: error2 } = await supabase.from('gallery_images').insert(payloadWithoutWatermark);
    if (error2) {
      const payloadMinimal = {
        image_url: params.afterUrl,
        caption: params.caption.trim() || null,
        sort_order: nextOrder,
        metadata,
        featured,
      };
      const { error: error3 } = await supabase.from('gallery_images').insert(payloadMinimal);
      if (error3) return { ok: false, error: error3.message };
    }
  }

  return { ok: true };
}

export async function dbUpdateGalleryFields(
  supabase: SupabaseClient,
  id: string,
  params: {
    caption?: string;
    vehicleLabel?: string;
    serviceLabel?: string;
    transformationPhase?: string;
    watermark?: boolean;
    published?: boolean;
    featured?: boolean;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: 'Missing id' };

  const { data: existing, error: getErr } = await supabase
    .from('gallery_images')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (getErr || !existing) {
    return { ok: false, error: getErr?.message ?? 'Gallery image not found' };
  }

  let metadata = existing.metadata || {};
  if (typeof metadata !== 'object' || metadata === null) {
    metadata = {};
  }

  if (params.vehicleLabel !== undefined) {
    metadata.vehicle_label = params.vehicleLabel || null;
  }
  if (params.serviceLabel !== undefined) {
    metadata.service_label = params.serviceLabel || null;
  }
  if (params.transformationPhase !== undefined) {
    metadata.transformation_phase = params.transformationPhase || null;
  }
  if (params.watermark !== undefined) {
    metadata.watermark = params.watermark;
  }

  const patch: Record<string, any> = {
    metadata,
  };

  if (params.caption !== undefined) {
    patch.caption = params.caption || null;
    patch.title = params.caption || null;
  }
  if (params.published !== undefined) {
    patch.published = params.published;
    patch.active = params.published;
  }
  if (params.featured !== undefined) {
    patch.featured = params.featured;
  }
  if (params.watermark !== undefined) {
    patch.watermark = params.watermark;
  }

  const { error } = await supabase.from('gallery_images').update(patch).eq('id', id);
  if (error) {
    if (patch.watermark !== undefined) {
      delete patch.watermark;
    }
    const { error: error2 } = await supabase.from('gallery_images').update(patch).eq('id', id);
    if (error2) return { ok: false, error: error2.message };
  }

  return { ok: true };
}
