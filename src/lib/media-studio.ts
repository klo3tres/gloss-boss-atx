import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_WORKSPACE_KEY } from '@/lib/titan/workspace-keys';

export type MediaAsset = {
  id: string;
  mediaType: string;
  placement: string;
  title: string | null;
  description: string | null;
  publicUrl: string | null;
  externalUrl: string | null;
  posterUrl: string | null;
  altText: string | null;
  caption: string | null;
  isActive: boolean;
  fileSizeBytes: number | null;
  mimeType: string | null;
  updatedAt: string;
};

export const MEDIA_PLACEMENTS = [
  'homepage_hero_video',
  'homepage_hero_poster',
  'brand_logo',
  'services_header',
  'service_card',
  'booking_vehicle_image',
  'gallery',
  'testimonial',
  'banner',
  'general',
] as const;

export async function loadMediaAssets(admin: SupabaseClient, workspaceKey = DEFAULT_WORKSPACE_KEY) {
  const { data, error } = await admin
    .from('site_media_assets')
    .select('*')
    .eq('workspace_key', workspaceKey)
    .order('updated_at', { ascending: false });

  if (error) return { items: [] as MediaAsset[], tablesReady: false };

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      mediaType: String(r.media_type ?? 'image'),
      placement: String(r.placement ?? 'general'),
      title: r.title == null ? null : String(r.title),
      description: r.description == null ? null : String(r.description),
      publicUrl: r.public_url == null ? null : String(r.public_url),
      externalUrl: r.external_url == null ? null : String(r.external_url),
      posterUrl: r.poster_url == null ? null : String(r.poster_url),
      altText: r.alt_text == null ? null : String(r.alt_text),
      caption: r.caption == null ? null : String(r.caption),
      isActive: r.is_active !== false,
      fileSizeBytes: typeof r.file_size_bytes === 'number' ? r.file_size_bytes : null,
      mimeType: r.mime_type == null ? null : String(r.mime_type),
      updatedAt: String(r.updated_at ?? ''),
    };
  });

  return { items, tablesReady: true };
}

export function resolveMediaUrl(asset: Pick<MediaAsset, 'publicUrl' | 'externalUrl'>): string | null {
  return asset.publicUrl || asset.externalUrl || null;
}
