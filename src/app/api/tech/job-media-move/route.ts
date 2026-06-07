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
    const isStaff = role === 'technician' || isAdminLevel(role);
    if (!isStaff) {
      return NextResponse.json({ error: 'Not authorized to modify photos.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      table?: string;
      newCategory?: string; // The slot e.g. front, wheels
      newPhase?: 'before' | 'after'; // Optional phase e.g. before, after
    };

    const id = String(body.id ?? '').trim();
    const table = body.table === 'job_photos' ? 'job_photos' : 'job_media';
    const newCategory = String(body.newCategory ?? '').trim();
    const newPhase = body.newPhase;

    if (!id) return NextResponse.json({ error: 'Missing photo id.' }, { status: 400 });
    if (!newCategory) return NextResponse.json({ error: 'Missing target category slot.' }, { status: 400 });

    // 1. Fetch original record
    const { data: row } = await admin.from(table).select('*').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });

    const updateFields: Record<string, any> = {
      photo_category: newCategory,
    };
    if (newPhase) {
      updateFields.category = newPhase;
    }

    // 2. Update primary record
    const updateRes = await admin.from(table).update(updateFields).eq('id', id);
    if (updateRes.error) {
      return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
    }

    // 3. Find and update the twin record in the alternative table
    const altTable = table === 'job_media' ? 'job_photos' : 'job_media';
    const url = String(
      (row as { public_url?: string }).public_url ||
        (row as { file_url?: string }).file_url ||
        (row as { media_url?: string }).media_url ||
        '',
    );

    if (url) {
      // Find twin by url
      const { data: twin } = await admin
        .from(altTable)
        .select('id')
        .or(`public_url.eq.${url},file_url.eq.${url},media_url.eq.${url}`)
        .maybeSingle();

      if (twin?.id) {
        const twinUpdate = await admin.from(altTable).update(updateFields).eq('id', twin.id);
        if (twinUpdate.error) {
          console.warn('[job-media-move] Failed to update twin record:', twinUpdate.error.message);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.warn('[job-media-move] error:', e);
    return NextResponse.json({ error: 'Failed to move photo.' }, { status: 500 });
  }
}
