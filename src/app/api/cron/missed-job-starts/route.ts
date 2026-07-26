import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { processAppointmentOperationalAlerts, processDueStaffJobReminders, processMissedJobStartAlerts } from '@/lib/staff-notification-router';
import { runTrackedAutomation } from '@/lib/titan/automation-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== 'production';
  const auth = request.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get('secret') === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const tracked = await runTrackedAutomation(admin, 'missed_job_starts', 'cron', async () => {
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
  return NextResponse.json(tracked, { status: tracked.ok ? 200 : tracked.alreadyRunning ? 409 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
