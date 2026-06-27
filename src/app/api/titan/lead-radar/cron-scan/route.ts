import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { runGooglePlacesLeadDiscovery } from '@/lib/titan/lead-radar-engine';
import {
  canSpendScanCredits,
  consumeScanCredits,
  LEAD_RADAR_ESTIMATED_REQUESTS,
  shouldAutoScanOnLogin,
} from '@/lib/titan/scan-budget';
import { loadOwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import type { ScanFrequency } from '@/lib/titan/scan-budget';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth === `Bearer ${secret}`) return true;
    const url = new URL(request.url);
    if (url.searchParams.get('secret') === secret) return true;
  }
  if (request.headers.get('x-vercel-cron') === '1') return true;
  return false;
}

export async function GET(request: Request) {
  return runScan(request, 'cron');
}

export async function POST(request: Request) {
  let source = 'manual';
  try {
    const body = (await request.json()) as { source?: string };
    if (body.source) source = body.source;
  } catch {
    /* empty body ok for cron */
  }
  return runScan(request, source);
}

async function runScan(request: Request, source: string) {
  const isCron = authorized(request);
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  if (!isCron && source !== 'admin_login') {
    const { getSessionWithProfile } = await import('@/lib/auth/session');
    const { isStaffRole } = await import('@/lib/auth/roles');
    const session = await getSessionWithProfile();
    if (!session.user || !isStaffRole(session.profile?.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const prefs = await loadOwnerNotificationPreferences(admin);
  const frequency = prefs.googlePlacesScanFrequency as ScanFrequency;

  if (!isCron && source === 'admin_login') {
    if (!prefs.leadRadarAutoScanEnabled || !shouldAutoScanOnLogin(prefs.lastLeadRadarScanAt, frequency)) {
      return NextResponse.json({ ok: false, skipped: true, message: 'Auto-scan not due yet.' });
    }
  }

  const budgetCheck = await canSpendScanCredits(admin, {
    provider: 'google_places',
    scanType: 'lead_radar',
    estimatedRequests: LEAD_RADAR_ESTIMATED_REQUESTS,
    dailyLimit: prefs.maxPlacesRequestsPerDay,
  });

  if (!budgetCheck.allowed) {
    return NextResponse.json({
      ok: false,
      error: budgetCheck.message ?? 'Daily scan limit reached.',
      remaining: budgetCheck.remaining,
      dailyLimit: budgetCheck.dailyLimit,
    });
  }

  const result = await runGooglePlacesLeadDiscovery(admin);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? 'Scan failed' });
  }

  await consumeScanCredits(admin, {
    provider: 'google_places',
    scanType: 'lead_radar',
    requestsUsed: LEAD_RADAR_ESTIMATED_REQUESTS,
    dailyLimit: prefs.maxPlacesRequestsPerDay,
    cooldownMinutes: frequency === 'hourly' ? 55 : undefined,
  });

  const remaining = Math.max(0, budgetCheck.remaining - LEAD_RADAR_ESTIMATED_REQUESTS);
  return NextResponse.json({
    ok: true,
    created: result.created,
    message: `${result.created} new prospects · ${remaining} scan credits left today.`,
    remaining,
  });
}
