import { NextResponse } from 'next/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function isFieldTechRole(role: string | null): boolean {
  return role === 'technician' || role === 'admin' || role === 'super_admin';
}

export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Server session unavailable' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (!profile?.role) {
      const em = (user.email ?? '').trim().toLowerCase();
      if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
    }
    if (!isFieldTechRole(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      checklist?: unknown;
      beforeNotes?: string;
      afterNotes?: string;
      upsellSuggestions?: string;
    };

    const checklist = Array.isArray(body.checklist) ? body.checklist.slice(0, 40) : [];
    const beforeNotes = String(body.beforeNotes ?? '').trim().slice(0, 8000);
    const afterNotes = String(body.afterNotes ?? '').trim().slice(0, 8000);
    const upsellSuggestions = String(body.upsellSuggestions ?? '').trim().slice(0, 8000);

    const { data, error } = await supabase
      .from('tech_job_notes')
      .insert({
        technician_id: user.id,
        checklist,
        before_notes: beforeNotes || null,
        after_notes: afterNotes || null,
        upsell_suggestions: upsellSuggestions || null,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn('[tech/job-notes]', error.message);
      return NextResponse.json({ error: 'Could not save notes (table missing?). Run latest migrations.' }, { status: 503 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e) {
    console.warn('[tech/job-notes]', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
