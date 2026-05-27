import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { runOwnerAssistantQuery } from '@/lib/owner-assistant-queries';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  let body: { question?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const question = String(body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 });

  const answer = await runOwnerAssistantQuery(admin, question);
  return NextResponse.json(answer);
}
