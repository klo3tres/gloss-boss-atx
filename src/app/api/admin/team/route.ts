import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { parseAppRole } from '@/lib/auth/role-resolution';

export const runtime = 'nodejs';

const STAFF_ROLES = new Set(['technician', 'admin', 'super_admin']);

type Body =
  | { intent: 'create'; email: string; password: string; role: string; fullName?: string }
  | { intent: 'reset_password'; userId: string; password: string }
  | { intent: 'assign_role'; profileId: string; role: string }
  | { intent: 'display_name'; profileId: string; fullName: string };

export async function POST(request: Request) {
  const gate = await requireSuperAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Server admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  }

  if (body.intent === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').trim();
    const role = String(body.role ?? '').trim();
    const fullNameRaw = String(body.fullName ?? '').trim();
    if (!email || !password || !STAFF_ROLES.has(role)) {
      return NextResponse.json({ ok: false, error: 'Valid email, password, and role are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const displayName = fullNameRaw || email.split('@')[0] || 'Staff';
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });

    let userId: string | null = created.data?.user?.id ?? null;
    let usedInvite = false;

    if (created.error || !userId) {
      const em = created.error?.message ?? '';
      if (/already|registered|exists|duplicate/i.test(em)) {
        return NextResponse.json({ ok: false, error: 'An account with this email already exists.' }, { status: 400 });
      }
      const invited = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: displayName },
      });
      if (invited.error || !invited.data?.user?.id) {
        return NextResponse.json(
          {
            ok: false,
            error: `${em || 'createUser failed'} — invite fallback failed: ${invited.error?.message ?? 'unknown'}`,
          },
          { status: 400 },
        );
      }
      userId = invited.data.user.id;
      usedInvite = true;
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      id: userId,
      full_name: displayName,
      display_name: displayName,
      role,
      email,
      updated_at: now,
    };
    let up = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
    if (up.error && /updated_at|email|display_name|column .* does not exist|Could not find|schema cache/i.test(up.error.message ?? '')) {
      up = await admin.from('profiles').upsert({ id: userId, full_name: displayName, role }, { onConflict: 'id' });
    }
    if (up.error) {
      return NextResponse.json({ ok: false, error: `User created but profile save failed: ${up.error.message}` }, { status: 400 });
    }
    revalidatePath('/admin/team');
    revalidatePath('/admin/super');
    return NextResponse.json({ ok: true, usedInvite });
  }

  if (body.intent === 'reset_password') {
    const userId = String(body.userId ?? '').trim();
    const password = String(body.password ?? '').trim();
    if (!userId || password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Valid user id and password (min 8 characters) required.' }, { status: 400 });
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'assign_role') {
    const targetId = String(body.profileId ?? '').trim();
    const nextRole = parseAppRole(String(body.role ?? '').trim());
    if (!targetId || !nextRole) {
      return NextResponse.json({ ok: false, error: 'Invalid role or profile id' }, { status: 400 });
    }
    if (targetId === gate.userId && nextRole !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'You cannot demote your own super_admin account from this panel.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    let { error } = await admin.from('profiles').update({ role: nextRole, updated_at: now }).eq('id', targetId);
    if (error && /updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const r2 = await admin.from('profiles').update({ role: nextRole }).eq('id', targetId);
      error = r2.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/super');
    revalidatePath('/admin/team');
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'display_name') {
    const profileId = String(body.profileId ?? '').trim();
    const fullName = String(body.fullName ?? '').trim();
    if (!profileId || !fullName) {
      return NextResponse.json({ ok: false, error: 'Profile id and display name required.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    let { error } = await admin.from('profiles').update({ full_name: fullName, display_name: fullName, updated_at: now }).eq('id', profileId);
    if (error && /display_name|updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const r2 = await admin.from('profiles').update({ full_name: fullName }).eq('id', profileId);
      error = r2.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unknown intent' }, { status: 400 });
}
