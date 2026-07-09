import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { disconnectBusinessIntegration, markIntegrationSync } from '@/lib/titan/integrations';
import type { TitanIntegrationType } from '@/lib/titan/industry-profiles';

export const dynamic = 'force-dynamic';

const VALID: TitanIntegrationType[] = [
  'google_calendar',
  'gmail',
  'stripe',
  'twilio',
  'website_forms',
  'resend',
];

export async function POST(
  _request: Request,
  context: { params: Promise<{ type: string }> },
) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { type } = await context.params;
  if (!VALID.includes(type as TitanIntegrationType)) {
    return NextResponse.json({ error: 'Unknown integration' }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const ctx = await resolveBusinessContext(admin);
  if (!ctx) return NextResponse.json({ error: 'No business context' }, { status: 403 });

  await disconnectBusinessIntegration(admin, ctx.businessId, type as TitanIntegrationType, gate.userId);
  return NextResponse.json({ ok: true });
}
