/** Shared before/after classification for job_media / job_photos rows. */

export type PhotoPhase = 'before' | 'after';

function norm(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const BEFORE_SLOTS = new Set([
  'before',
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'interior',
  'wheels',
  'inspection',
  'damage',
  'other',
]);

/** Phase is stored in `category` (before|after). `photo_category` is the slot (front, rear, …). */
export function resolvePhotoPhase(row: Record<string, unknown>): PhotoPhase {
  const category = norm(row.category);
  if (category === 'after') return 'after';
  if (category === 'before') return 'before';
  const slot = norm(row.photo_category);
  if (slot === 'after') return 'after';
  if (BEFORE_SLOTS.has(slot)) return 'before';
  return 'before';
}

export function resolvePhotoSlot(row: Record<string, unknown>): string {
  const slot = norm(row.photo_category);
  if (slot && slot !== 'before' && slot !== 'after') return slot;
  return norm(row.category) || 'other';
}

export const PHOTO_SLOT_OPTIONS = [
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'interior',
  'wheels',
  'damage',
  'other',
] as const;
