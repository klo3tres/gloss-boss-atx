import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { confirmAppointmentLifecycle } from '@/lib/appointment-lifecycle';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }
  const { id } = await context.params;
  const appointmentId = id?.trim();
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: 'Missing appointment.' }, { status: 400 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    overrideEligibility?: boolean;
    reason?: string;
  };
  const reason = body.reason?.trim() ?? '';
  if (body.overrideEligibility && !reason) {
    return NextResponse.json(
      { ok: false, error: 'An override reason is required.' },
      { status: 400 },
    );
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Admin database unavailable.' }, { status: 503 });
  }
  const result = await confirmAppointmentLifecycle(admin, {
    appointmentId,
    actorId: gate.userId,
    reason: reason || 'Admin appointment confirmation',
    overrideEligibility: body.overrideEligibility === true,
    allowAdminOverride: body.overrideEligibility === true,
  });
  if (!result.ok) {
    const status =
      result.code === 'ACKNOWLEDGEMENT_REQUIRED' || result.code === 'PAYMENT_REQUIRED'
        ? 409
        : /not found/i.test(result.error ?? '')
          ? 404
          : /inactive/i.test(result.error ?? '')
            ? 409
            : 500;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
