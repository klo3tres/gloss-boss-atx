import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { backfillAllAppointmentVehicles } from '@/lib/crm-vehicle-sync';

export async function POST() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const result = await backfillAllAppointmentVehicles(admin);
  return NextResponse.json({ ok: true, ...result });
}
