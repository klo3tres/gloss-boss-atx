import { NextResponse } from 'next/server';
import { isAdminLevel } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/**
 * Lightweight check so CMS can skip upload attempts when the `gallery` bucket is missing.
 */
export async function GET() {
  const supabaseUser = await tryCreateServerSupabase();
  if (!supabaseUser) {
    return NextResponse.json({ ok: false, galleryReady: false, message: 'Server session unavailable.' }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabaseUser.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, galleryReady: false, message: 'Not authenticated.' }, { status: 401 });
  }

  const { data: profile, error: profErr } = await supabaseUser.from('profiles').select('role').eq('id', user.id).maybeSingle();
  let role = parseAppRole(profile?.role);
  if (profErr || !profile || profile.role == null || String(profile.role).trim() === '') {
    const em = (user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) {
      role = 'super_admin';
    }
  }
  if (!isAdminLevel(role)) {
    return NextResponse.json({ ok: false, galleryReady: false, message: 'Forbidden.' }, { status: 403 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({
      ok: false,
      galleryReady: false,
      message: 'Storage check requires SUPABASE_SERVICE_ROLE_KEY on the server.',
    });
  }

  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    console.warn('[CRM_DEBUG]', 'gallery_bucket_status', error.message);
    return NextResponse.json({ ok: false, galleryReady: false, message: error.message });
  }

  const galleryReady = buckets?.some((b) => b.name === 'gallery') ?? false;
  return NextResponse.json({ ok: true, galleryReady });
}
