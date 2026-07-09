import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { roleLabel, validateStaffInviteToken } from '@/lib/staff-invites';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token.' }, { status: 400 });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });

  const validated = await validateStaffInviteToken(admin, token);
  if (!validated.ok || !validated.invite) {
    return NextResponse.json({ ok: false, error: validated.error ?? 'Invalid invite.' }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    invite: {
      fullName: validated.invite.fullName,
      email: validated.invite.email,
      phone: validated.invite.phone,
      role: validated.invite.role,
      roleLabel: roleLabel(validated.invite.role),
    },
  });
}
