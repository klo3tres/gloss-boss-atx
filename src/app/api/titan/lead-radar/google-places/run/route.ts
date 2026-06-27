import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { runGooglePlacesLeadDiscovery } from '@/lib/titan/lead-radar-engine';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

export async function POST() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  const result = await runGooglePlacesLeadDiscovery(admin);
  if (result.ok) {
    revalidatePath('/admin/titan');
    revalidatePath('/admin/titan/lead-radar');
  }

  return NextResponse.json(result);
}
