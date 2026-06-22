import { NextResponse } from 'next/server';
import { runFollowUpEngine } from '@/lib/follow-up-engine';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

/** Vercel Hobby: once daily at 14:00 UTC (see vercel.json). Use Follow-ups → Run engine now between runs. */

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  return url.searchParams.get('secret') === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });
  }

  try {
    const result = await runFollowUpEngine(admin);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Follow-up engine failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
