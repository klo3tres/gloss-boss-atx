import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { markIntegrationSync } from '@/lib/titan/integrations';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ type: string }> },
) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { type } = await context.params;
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const ctx = await resolveBusinessContext(admin);
  if (!ctx) return NextResponse.json({ error: 'No business context' }, { status: 403 });

  if (type === 'google_calendar') {
    try {
      const { pullGoogleCalendarEvents } = await import('@/lib/google/google-calendar-sync');
      await pullGoogleCalendarEvents(admin);
      await markIntegrationSync(admin, ctx.businessId, 'google_calendar');
      return NextResponse.json({ ok: true, message: 'Calendar sync completed' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markIntegrationSync(admin, ctx.businessId, 'google_calendar', { error: msg });
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  if (type === 'quickbooks' || type === 'zapier' || type === 'meta') {
    await markIntegrationSync(admin, ctx.businessId, type as 'meta');
    const hints: Record<string, string> = {
      quickbooks: 'QuickBooks OAuth — add INTUIT_CLIENT_ID and INTUIT_CLIENT_SECRET, then reconnect.',
      zapier: 'Zapier ready — use Titan API key webhook at /api/titan/leads from your Zap.',
      meta: 'Meta lead sync — configure META_APP_ID and webhook verify token in env.',
    };
    return NextResponse.json({ ok: true, message: hints[type] ?? `${type} integration staged` });
  }

  await markIntegrationSync(admin, ctx.businessId, type as 'twilio');
  return NextResponse.json({ ok: true, message: `${type} sync acknowledged` });
}
