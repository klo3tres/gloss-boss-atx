import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { DEFAULT_WORKSPACE_KEY } from '@/lib/titan/workspace-keys';
import { isDirectMediaUrl } from '@/lib/media-studio';

export const runtime = 'nodejs';

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 80 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload';
}

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  const placement = String(form.get('placement') ?? 'general').trim();
  const title = String(form.get('title') ?? '').trim();
  const altText = String(form.get('altText') ?? '').trim();
  const externalUrl = String(form.get('externalUrl') ?? '').trim();

  if (!(file instanceof File) || file.size === 0) {
    if (!externalUrl) return NextResponse.json({ ok: false, error: 'Upload a file or provide external URL' }, { status: 400 });
    const mediaType = externalUrl.match(/\.(mp4|webm|mov)(\?|$)/i) ? 'video' : 'image';
    const { data, error } = await admin
      .from('site_media_assets')
      .insert({
        workspace_key: DEFAULT_WORKSPACE_KEY,
        media_type: mediaType,
        placement,
        title: title || null,
        external_url: externalUrl,
        public_url: externalUrl,
        alt_text: altText || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (placement === 'homepage_hero_image' || placement === 'homepage_hero_video') {
      const setLive = await admin.rpc('set_homepage_hero_asset', {
        p_asset_id: data.id,
        p_workspace_key: DEFAULT_WORKSPACE_KEY,
      });
      if (setLive.error) return NextResponse.json({ ok: false, error: setLive.error.message }, { status: 400 });
    }
    revalidatePaths();
    return NextResponse.json({ ok: true, id: data.id, url: externalUrl });
  }

  const mime = file.type || 'application/octet-stream';
  const isVideo = VIDEO_TYPES.has(mime);
  const isImage = IMAGE_TYPES.has(mime);
  if (!isVideo && !isImage) {
    return NextResponse.json({ ok: false, error: 'Unsupported file type. Use JPG, PNG, WebP, MP4, or WebM.' }, { status: 400 });
  }
  if (isImage && file.size > MAX_IMAGE) return NextResponse.json({ ok: false, error: 'Image max 8MB' }, { status: 400 });
  if (isVideo && file.size > MAX_VIDEO) return NextResponse.json({ ok: false, error: 'Video max 80MB' }, { status: 400 });

  const { data: buckets } = await admin.storage.listBuckets();
  if (!buckets?.some((b) => b.name === 'gallery')) {
    return NextResponse.json({ ok: false, error: 'Storage bucket "gallery" missing in Supabase.' }, { status: 503 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = `media-studio/${randomUUID()}-${safeName(file.name)}`;
  const { error: upErr } = await admin.storage.from('gallery').upload(path, buf, { contentType: mime, upsert: false });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from('gallery').getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { data, error } = await admin
    .from('site_media_assets')
    .insert({
      workspace_key: DEFAULT_WORKSPACE_KEY,
      media_type: isVideo ? 'video' : 'image',
      placement,
      title: title || file.name,
      storage_path: path,
      public_url: publicUrl,
      alt_text: altText || null,
      file_size_bytes: file.size,
      mime_type: mime,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select('id, public_url')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (placement === 'homepage_hero_image' || placement === 'homepage_hero_video') {
    const setLive = await admin.rpc('set_homepage_hero_asset', {
      p_asset_id: data.id,
      p_workspace_key: DEFAULT_WORKSPACE_KEY,
    });
    if (setLive.error) return NextResponse.json({ ok: false, error: setLive.error.message }, { status: 400 });
  }
  revalidatePaths();
  return NextResponse.json({ ok: true, id: data.id, url: data.public_url });
}

export async function PATCH(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  const body = (await request.json()) as {
    id?: string;
    placement?: string;
    isActive?: boolean;
    title?: string;
    altText?: string;
    posterUrl?: string;
    cropSettings?: { focalX?: number; focalY?: number; zoom?: number };
    setAsHomepageHero?: boolean;
  };
  const id = String(body.id ?? '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });

  if (body.setAsHomepageHero === true) {
    const { data: asset } = await admin
      .from('site_media_assets')
      .select('id, public_url, external_url, media_type, mime_type, workspace_key')
      .eq('id', id)
      .eq('workspace_key', DEFAULT_WORKSPACE_KEY)
      .maybeSingle();
    if (!asset) return NextResponse.json({ ok: false, error: 'Media asset not found in this workspace.' }, { status: 404 });
    const liveUrl = String(asset.public_url ?? asset.external_url ?? '').trim();
    if (!isDirectMediaUrl(liveUrl, String(asset.media_type ?? 'image'), asset.mime_type ? String(asset.mime_type) : null)) {
      return NextResponse.json({ ok: false, error: 'Choose an uploaded file or a direct image/video URL. Webpage links cannot be used as hero media.' }, { status: 400 });
    }
    const result = await admin.rpc('set_homepage_hero_asset', {
      p_asset_id: id,
      p_workspace_key: DEFAULT_WORKSPACE_KEY,
    });
    if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 400 });
    revalidatePaths();
    return NextResponse.json({ ok: true, liveUrl, placement: asset.media_type === 'video' ? 'homepage_hero_video' : 'homepage_hero_image' });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.placement === 'string') patch.placement = body.placement;
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive;
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 160);
  if (typeof body.altText === 'string') patch.alt_text = body.altText.slice(0, 200);
  if (typeof body.posterUrl === 'string') patch.poster_url = body.posterUrl.slice(0, 500);
  if (body.cropSettings && typeof body.cropSettings === 'object') {
    patch.crop_settings = {
      focalX: Math.min(100, Math.max(0, Number(body.cropSettings.focalX ?? 50))),
      focalY: Math.min(100, Math.max(0, Number(body.cropSettings.focalY ?? 50))),
      zoom: Math.min(3, Math.max(1, Number(body.cropSettings.zoom ?? 1))),
    };
  }

  const { error } = await admin.from('site_media_assets').update(patch).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  revalidatePaths();
  return NextResponse.json({ ok: true });
}

function revalidatePaths() {
  revalidatePath('/admin/media-studio');
  revalidatePath('/');
  revalidatePath('/services');
  revalidatePath('/book');
  revalidatePath('/api/public/site-data');
}
