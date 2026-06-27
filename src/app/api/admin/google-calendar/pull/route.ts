import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { pullGoogleCalendarEvents } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  const result = await pullGoogleCalendarEvents(admin, { daysAhead: 45 });
  if (!result.ok) return NextResponse.json(result, { status: 400 });

  revalidatePath('/admin/calendar');
  revalidatePath('/admin/setup-center');
  return NextResponse.json({ ok: true, imported: result.imported ?? 0 });
}
