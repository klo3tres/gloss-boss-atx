'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { recordAssignmentEvent } from '@/lib/assignment-events';

async function requireTechnicianSupabase() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user) {
    return { ok: false as const, supabase: null, userId: null };
  }
  let role = parseAppRole(session.profile?.role ?? null);
  if (!session.profile?.role) {
    const em = (session.user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
  }
  if (role !== 'technician') {
    return { ok: false as const, supabase: null, userId: null };
  }
  return { ok: true as const, supabase, userId: session.user.id };
}

export async function techClaimLeadAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '').trim();
  if (!leadId) return;

  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) return;

  const nowIso = new Date().toISOString();
  const { error } = await gate.supabase
    .from('leads')
    .update({
      assigned_technician_id: gate.userId,
      assigned_to: gate.userId,
      assigned_at: nowIso,
      claimed_at: nowIso,
      assigned_by: gate.userId,
      status: 'claimed',
      in_pool: false,
      updated_at: nowIso,
    })
    .eq('id', leadId);

  if (error) {
    console.warn('[tech] claim lead', error.message);
    return;
  }

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'lead',
    entityId: leadId,
    action: 'claim',
    technicianId: gate.userId,
    previousTechnicianId: null,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[tech] assignment_events', ev.error);

  revalidatePath('/tech');
  revalidatePath('/admin/leads');
}
