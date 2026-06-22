import { NextResponse } from 'next/server';
import { requireProfileRoles } from '@/lib/auth/require-profile-role';
import { tryCreateServerSupabase } from '@/lib/supabase/safeClient.server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { runTitanQuery } from '@/lib/titan-queries';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await tryCreateServerSupabase();
  if (!supabase) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  const gate = await requireProfileRoles(supabase, ['super_admin']);
  if (!gate.ok) return gate.response;

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  let body: { question?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const question = String(body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Question required' }, { status: 400 });

  const answer = await runTitanQuery(admin, question);
  return NextResponse.json(answer);
}
