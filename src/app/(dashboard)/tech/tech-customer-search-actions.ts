'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';

export async function techSearchCustomersAction(query: string): Promise<
  { ok: true; rows: { id: string; email: string; full_name: string | null; phone: string | null }[] } | { ok: false; error: string }
> {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.user || !supabase) return { ok: false, error: 'Unauthorized' };
  let role = parseAppRole(session.profile?.role ?? null);
  if (!session.profile?.role) {
    const em = (session.user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
  }
  if (role !== 'technician') return { ok: false, error: 'Technicians only' };

  const q = query.trim().slice(0, 80);
  if (q.length < 2) return { ok: true, rows: [] };

  const { data, error } = await supabase
    .from('customers')
    .select('id, email, full_name, phone')
    .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(12);

  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as { id: string; email: string; full_name: string | null; phone: string | null }[] };
}
