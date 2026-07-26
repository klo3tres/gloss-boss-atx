import { NextResponse } from 'next/server';
import { requireStaffApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { processAppointmentOperationalAlerts, processDueStaffJobReminders, processMissedJobStartAlerts } from '@/lib/staff-notification-router';
import { runTrackedAutomation } from '@/lib/titan/automation-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const gate = await requireStaffApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const tracked = await runTrackedAutomation(admin, 'missed_job_starts', 'manual', async () => {
      const [reminders, late, operations] = await Promise.all([
        processDueStaffJobReminders(admin),
        processMissedJobStartAlerts(admin),
        processAppointmentOperationalAlerts(admin),
      ]);
      return {
        reminded: reminders.sent,
        alerted: late.alerted + operations.alerted,
        skipped: reminders.skipped + late.skipped + operations.skipped,
        failed: reminders.failed + late.failed + operations.failed,
      };
  });
  return NextResponse.json(tracked, { status: tracked.ok || tracked.alreadyRunning ? 200 : 500 });
}
