import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { syncGoogleReviewsToDatabase } from '@/lib/google/google-place-reviews';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs';

export async function POST() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  const result = await syncGoogleReviewsToDatabase(admin);
  if (result.ok) {
    revalidatePath('/');
    revalidatePath('/admin/cms');
    revalidatePath('/admin/reviews');
    revalidatePath('/api/public/site-data');
  }

  return NextResponse.json(result);
}
