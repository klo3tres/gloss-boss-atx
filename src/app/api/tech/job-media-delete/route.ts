import { NextResponse } from 'next/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateServerSupabase } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    const admin = tryCreateAdminSupabase();
    if (!supabase || !admin) {
      return NextResponse.json({ error: 'Server not configured.' }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (!profile?.role && (user.email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL) role = 'super_admin';
    if (!isAdminLevel(role)) {
      return NextResponse.json({ error: 'Only admins can delete job photos.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      table?: string;
      storagePath?: string;
      storageBucket?: string;
    };
    const id = String(body.id ?? '').trim();
    const table = body.table === 'job_photos' ? 'job_photos' : 'job_media';
    if (!id) return NextResponse.json({ error: 'Missing photo id.' }, { status: 400 });

    const { data: row } = await admin.from(table).select('*').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });

    const bucket = String(body.storageBucket || (row as { storage_bucket?: string }).storage_bucket || process.env.JOB_MEDIA_BUCKET || 'job-media');
    const paths = [
      String(body.storagePath || ''),
      String((row as { storage_path?: string }).storage_path || ''),
      String((row as { thumbnail_path?: string }).thumbnail_path || ''),
      String((row as { file_path?: string }).file_path || ''),
    ].filter(Boolean);

    if (paths.length) {
      await admin.storage.from(bucket).remove([...new Set(paths)]).catch(() => undefined);
    }

    const del = await admin.from(table).delete().eq('id', id);
    if (del.error) {
      return NextResponse.json({ error: del.error.message }, { status: 500 });
    }

    const altTable = table === 'job_media' ? 'job_photos' : 'job_media';
    const url = String(
      (row as { public_url?: string }).public_url ||
        (row as { file_url?: string }).file_url ||
        (row as { media_url?: string }).media_url ||
        '',
    );
    if (url) {
      const altDel = await admin.from(altTable).delete().or(`public_url.eq.${url},file_url.eq.${url},media_url.eq.${url}`);
      if (altDel.error) console.warn('[job-media-delete] alt table', altDel.error.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn('[job-media-delete]', e);
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  }
}
