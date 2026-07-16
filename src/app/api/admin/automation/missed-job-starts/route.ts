import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { processAppointmentOperationalAlerts, processMissedJobStartAlerts } from '@/lib/staff-notification-router';
import { runTrackedAutomation } from '@/lib/titan/automation-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const tracked = await runTrackedAutomation(admin, 'missed_job_starts', 'manual', async () => {
      const [late, operations] = await Promise.all([processMissedJobStartAlerts(admin), processAppointmentOperationalAlerts(admin)]);
      return { alerted: late.alerted + operations.alerted, skipped: late.skipped + operations.skipped, failed: late.failed + operations.failed };
  });
  return NextResponse.json(tracked, { status: tracked.ok || tracked.alreadyRunning ? 200 : 500 });
}
