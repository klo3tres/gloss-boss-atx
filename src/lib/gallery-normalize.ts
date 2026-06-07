/** Normalize arbitrary `gallery_images` rows (schema drift) for UI + public API. */

export type NormalizedGalleryImage = {
  id: string;
  /** Primary resolved public image URL */
  url: string;
  /** Legacy alias — same as `url` for components that still read `image_url` */
  image_url: string;
  caption: string | null;
  sort_order: number;
  order_index: number | null;
  published?: boolean;
  /** When true, show before non-featured in marketing carousels */
  featured?: boolean;
  watermark?: boolean;
};

/** Marketing / public portfolio — includes before/after pair fields when stored on row or metadata. */
export type PublicGalleryItem = NormalizedGalleryImage & {
  beforeUrl?: string | null;
  afterUrl?: string | null;
  vehicleLabel?: string | null;
  serviceLabel?: string | null;
  createdAt?: string | null;
  jobId?: string | null;
  vehicleClass?: string | null;
  serviceCategory?: string | null;
  destination?: string | null;
  tags?: string[];
};

function galleryMetaField(row: Record<string, unknown>, key: string): string {
  const direct = str(row[key]);
  if (direct) return direct;
  const meta = row.metadata;
  if (meta && typeof meta === 'object') {
    const v = (meta as Record<string, unknown>)[key];
    if (typeof v === 'string') return v.trim();
  }
  return '';
}

function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  return '';
}

/** Prefer `url`, then `public_url`, then legacy `image_url` / other keys. */
export function resolveGalleryImageUrl(row: Record<string, unknown>): string {
  const direct = str(row.url) || str(row.public_url) || str(row.image_url) || str(row.photo_url) || str(row.src);
  return direct;
}

/** Automotive stock fallback when CMS row has no usable URL (never empty cards). */
export const GALLERY_SAFE_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1503376780353-7e6692761b13?auto=format&fit=crop&w=1200&q=80';

/** Resolved image URL or placeholder — never returns empty string. */
export function safeImageUrl(row: Record<string, unknown>): string {
  const u = resolveGalleryImageUrl(row);
  return u || GALLERY_SAFE_PLACEHOLDER_IMAGE;
}

/** caption → title → label → '' */
export function safeCaption(row: Record<string, unknown>): string {
  return resolveGalleryCaption(row) ?? '';
}

/** caption ?? title ?? label ?? '' (trimmed); empty stored as null for compact JSON. */
export function resolveGalleryCaption(row: Record<string, unknown>): string | null {
  const c = str(row.caption) || str(row.title) || str(row.label);
  return c || null;
}

const RAW_FILENAME_RE = /\.(jpe?g|png|webp|gif|heic|avif)$/i;
const FILENAME_LIKE_RE = /^(img|dsc|photo|image|snap|screenshot|wp|p\d|vid)[-_]?\d*/i;
/** e.g. jeep_trackhawk_8k, IMG_1234 — underscore slug without spaces */
const UNDERSCORE_FILENAME_RE = /^[a-z0-9]+(_[a-z0-9]+)+$/i;

function looksLikeRawFilename(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.includes('/') || t.includes('\\')) return true;
  if (RAW_FILENAME_RE.test(t)) return true;
  if (FILENAME_LIKE_RE.test(t)) return true;
  if (UNDERSCORE_FILENAME_RE.test(t) && !t.includes(' ')) return true;
  if (/^[a-f0-9-]{20,}$/i.test(t)) return true;
  if (/\.[a-z0-9]{2,5}$/i.test(t) && !t.includes(' ')) return true;
  return false;
}

/** Never show storage paths or filenames to customers. */
export function publicGalleryDisplayTitle(row: PublicGalleryItem | Record<string, unknown>): string {
  const r = row as Record<string, unknown>;
  const caption = str(r.caption) || str(r.title) || str(r.label);
  const vehicle = str(r.vehicleLabel) || str(r.vehicle_label);
  const service = str(r.serviceLabel) || str(r.service_label);
  if (caption && !looksLikeRawFilename(caption)) return caption;
  if (vehicle && service) return `${vehicle} · ${service.replace(/-/g, ' ')}`;
  if (vehicle) return vehicle;
  if (service) return service.replace(/-/g, ' ');
  return 'Gloss Boss ATX detail';
}

/** Marketing/public: skip rows without a real uploaded URL (no stock placeholders). */
export function normalizeGalleryRowPublic(row: Record<string, unknown>): PublicGalleryItem | null {
  const id = str(row.id);
  if (!id) return null;
  const url = resolveGalleryImageUrl(row);
  if (!url) return null;
  const sort_order =
    typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order)
      ? row.sort_order
      : typeof row.order_index === 'number' && !Number.isNaN(row.order_index)
        ? row.order_index
        : 0;
  const order_index =
    typeof row.order_index === 'number' && !Number.isNaN(row.order_index)
      ? row.order_index
      : typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order)
        ? row.sort_order
        : null;
  const published = (row.published ?? row.active ?? true) as boolean | undefined;
  const featured = typeof row.featured === 'boolean' ? row.featured : false;
  const beforeUrl =
    galleryMetaField(row, 'before_url') ||
    galleryMetaField(row, 'beforeUrl') ||
    galleryMetaField(row, 'before_image_url') ||
    null;
  const afterUrl =
    galleryMetaField(row, 'after_url') ||
    galleryMetaField(row, 'afterUrl') ||
    galleryMetaField(row, 'after_image_url') ||
    url;
  const vehicleLabel = galleryMetaField(row, 'vehicle_label') || galleryMetaField(row, 'vehicleLabel') || null;
  const serviceLabel = galleryMetaField(row, 'service_label') || galleryMetaField(row, 'serviceLabel') || null;
  const jobId = galleryMetaField(row, 'job_id') || galleryMetaField(row, 'jobId') || null;
  const vehicleClass = galleryMetaField(row, 'vehicle_class') || galleryMetaField(row, 'vehicleClass') || null;
  const serviceCategory = galleryMetaField(row, 'service_category') || galleryMetaField(row, 'serviceCategory') || null;
  const destination = galleryMetaField(row, 'destination') || null;
  const rawTags =
    Array.isArray(row.tags)
      ? row.tags
      : row.metadata && typeof row.metadata === 'object' && Array.isArray((row.metadata as Record<string, unknown>).tags)
        ? ((row.metadata as Record<string, unknown>).tags as unknown[])
        : [];
  const tags = rawTags.map((tag) => str(tag)).filter(Boolean);
  const createdAt = typeof row.created_at === 'string' ? row.created_at : typeof row.createdAt === 'string' ? row.createdAt : null;

  const watermark = Boolean(
    row.watermark ??
      (row.metadata && typeof row.metadata === 'object' && (row.metadata as Record<string, unknown>).watermark)
  );
  const item: PublicGalleryItem = {
    id,
    url,
    image_url: url,
    caption: null,
    sort_order,
    order_index: order_index ?? null,
    published: typeof published === 'boolean' ? published : true,
    featured,
    watermark,
    beforeUrl: beforeUrl || null,
    afterUrl: afterUrl || url,
    vehicleLabel: vehicleLabel || null,
    serviceLabel: serviceLabel || null,
    jobId: jobId || null,
    vehicleClass: vehicleClass || null,
    serviceCategory: serviceCategory || null,
    destination: destination || null,
    tags,
    createdAt: createdAt || null,
  };
  item.caption = publicGalleryDisplayTitle(item);
  return item;
}

export function normalizeGalleryRowsPublic(rows: unknown[] | null | undefined): PublicGalleryItem[] {
  if (!Array.isArray(rows)) return [];
  const out: PublicGalleryItem[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const n = normalizeGalleryRowPublic(r as Record<string, unknown>);
    if (n) out.push(n);
  }
  return out;
}

export function normalizeGalleryRow(row: Record<string, unknown>): NormalizedGalleryImage | null {
  const id = str(row.id);
  if (!id) return null;
  const url = safeImageUrl(row);
  const sort_order =
    typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order)
      ? row.sort_order
      : typeof row.order_index === 'number' && !Number.isNaN(row.order_index)
        ? row.order_index
        : 0;
  const order_index =
    typeof row.order_index === 'number' && !Number.isNaN(row.order_index)
      ? row.order_index
      : typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order)
        ? row.sort_order
        : null;
  const published = (row.published ?? row.active ?? true) as boolean | undefined;
  const featured = typeof row.featured === 'boolean' ? row.featured : false;
  const watermark = Boolean(
    row.watermark ??
      (row.metadata && typeof row.metadata === 'object' && (row.metadata as Record<string, unknown>).watermark)
  );
  return {
    id,
    url,
    image_url: url,
    caption: resolveGalleryCaption(row),
    sort_order,
    order_index: order_index ?? null,
    published: typeof published === 'boolean' ? published : true,
    featured,
    watermark,
  };
}

/** For reorder / admin lists: derive sort fields from `select('*')` rows without requiring image URL. */
export function extractGallerySortRow(row: Record<string, unknown>): { id: string; sort_order: number; order_index: number | null } | null {
  const id = str(row.id);
  if (!id) return null;
  const sort_order =
    typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order)
      ? row.sort_order
      : typeof row.order_index === 'number' && !Number.isNaN(row.order_index)
        ? row.order_index
        : 0;
  const order_index =
    typeof row.order_index === 'number' && !Number.isNaN(row.order_index) ? row.order_index : typeof row.sort_order === 'number' ? row.sort_order : null;
  return { id, sort_order, order_index };
}

export function normalizeGalleryRows(rows: unknown[] | null | undefined): NormalizedGalleryImage[] {
  if (!Array.isArray(rows)) return [];
  const out: NormalizedGalleryImage[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const n = normalizeGalleryRow(r as Record<string, unknown>);
    if (n) out.push(n);
  }
  return out;
}

export type AdminGalleryRow = {
  id: string;
  image_url: string;
  url: string | null;
  caption: string | null;
  sort_order: number;
  order_index: number | null;
  published: boolean;
  featured: boolean;
  created_at: string;
  watermark?: boolean;
  vehicleLabel?: string | null;
  serviceLabel?: string | null;
  transformationPhase?: string | null;
};

export function mapRawToAdminGalleryRow(raw: Record<string, unknown>): AdminGalleryRow | null {
  const n = normalizeGalleryRow(raw);
  const vehicleLabel = galleryMetaField(raw, 'vehicle_label') || galleryMetaField(raw, 'vehicleLabel') || null;
  const serviceLabel = galleryMetaField(raw, 'service_label') || galleryMetaField(raw, 'serviceLabel') || null;
  const phase = galleryMetaField(raw, 'transformation_phase') || galleryMetaField(raw, 'transformationPhase') || null;

  if (n) {
    return {
      id: n.id,
      image_url: n.image_url,
      url: n.url,
      caption: n.caption,
      sort_order: n.sort_order,
      order_index: n.order_index,
      published: Boolean(raw.published ?? raw.active ?? true),
      featured: Boolean(raw.featured),
      created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
      watermark: n.watermark,
      vehicleLabel,
      serviceLabel,
      transformationPhase: phase,
    };
  }
  const id = str(raw.id);
  if (!id) return null;
  const sortEx = extractGallerySortRow(raw);
  if (!sortEx) return null;
  const url = safeImageUrl(raw);
  return {
    id,
    image_url: url,
    url: resolveGalleryImageUrl(raw) || null,
    caption: resolveGalleryCaption(raw),
    sort_order: sortEx.sort_order,
    order_index: sortEx.order_index,
    published: Boolean(raw.published ?? raw.active ?? true),
    featured: Boolean(raw.featured),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    watermark: Boolean(
      raw.watermark ??
        (raw.metadata && typeof raw.metadata === 'object' && (raw.metadata as Record<string, unknown>).watermark)
    ),
    vehicleLabel,
    serviceLabel,
    transformationPhase: phase,
  };
}

export function mapAdminGalleryRows(raw: unknown[] | null | undefined): AdminGalleryRow[] {
  if (!Array.isArray(raw)) return [];
  const out: AdminGalleryRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const row = mapRawToAdminGalleryRow(r as Record<string, unknown>);
    if (row) out.push(row);
  }
  return out;
}

/** Max sort key from raw gallery rows (for next `sort_order` after `select('*')`). */
export function maxGallerySortFromRows(raw: unknown[] | null | undefined): number {
  let max = 0;
  for (const r of raw ?? []) {
    if (!r || typeof r !== 'object') continue;
    const e = extractGallerySortRow(r as Record<string, unknown>);
    if (!e) continue;
    max = Math.max(max, e.sort_order, e.order_index ?? 0);
  }
  return max;
}

/** Insert payloads to try against drifted `gallery_images` schemas (first non-error wins). */
export function galleryInsertPayloadVariants(
  publicUrl: string,
  caption: string,
  nextOrder: number,
  meta?: { phase?: string; vehicleLabel?: string; serviceLabel?: string },
): Record<string, unknown>[] {
  const cap = caption.trim() || null;
  const title = caption.trim() || null;
  const phase = meta?.phase?.trim() || null;
  const vehicle = meta?.vehicleLabel?.trim() || null;
  const service = meta?.serviceLabel?.trim() || null;
  const metadata =
    phase || vehicle || service
      ? { transformation_phase: phase, vehicle_label: vehicle, service_label: service, before_url: phase === 'before' ? publicUrl : null, after_url: phase === 'after' ? publicUrl : publicUrl }
      : null;
  const withMeta = metadata ? { metadata } : {};
  return [
    { image_url: publicUrl, url: publicUrl, caption: cap, sort_order: nextOrder, order_index: nextOrder, published: true, ...withMeta },
    { image_url: publicUrl, url: publicUrl, title, sort_order: nextOrder, order_index: nextOrder, published: true, ...withMeta },
    { url: publicUrl, public_url: publicUrl, title, sort_order: nextOrder, order_index: nextOrder, published: true },
    { url: publicUrl, image_url: publicUrl, sort_order: nextOrder, order_index: nextOrder, published: true },
    { image_url: publicUrl, sort_order: nextOrder, published: true },
    { url: publicUrl, sort_order: nextOrder, published: true },
  ];
}
