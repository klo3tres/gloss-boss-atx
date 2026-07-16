import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { isManualAutomationKey, runManualAutomation } from '@/lib/admin/manual-automation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ engine: string }> }) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const { engine } = await context.params;
  if (!isManualAutomationKey(engine)) {
    return NextResponse.json({ error: 'Unknown automation engine.' }, { status: 404 });
  }

  const result = await runManualAutomation(admin, engine);
  return NextResponse.json(result, { status: result.ok || result.alreadyRunning ? 200 : 500 });
}
