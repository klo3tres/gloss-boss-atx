import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function redirectBack(request: Request, appointmentId: string, ok: boolean) {
  const url = new URL(`/review/${encodeURIComponent(appointmentId)}?${ok ? 'submitted=1' : 'error=1'}`, request.url);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const appointmentId = String(form.get('appointmentId') ?? '').trim();
  const testimonial = String(form.get('testimonial') ?? '').trim();
  const rating = Math.max(1, Math.min(5, Number(form.get('rating') ?? 5)));
  if (!appointmentId || !testimonial) return redirectBack(request, appointmentId || 'missing', false);

  const admin = tryCreateAdminSupabase();
  if (!admin) return redirectBack(request, appointmentId, false);

  const { data: appointment } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, guest_name, service_slug')
    .eq('id', appointmentId)
    .maybeSingle();

  const row = {
    appointment_id: appointmentId,
    customer_id: (appointment as { customer_id?: string | null } | null)?.customer_id ?? null,
    customer_email: (appointment as { guest_email?: string | null } | null)?.guest_email ?? null,
    customer_name: (appointment as { guest_name?: string | null } | null)?.guest_name ?? null,
    service_label: String((appointment as { service_slug?: string | null } | null)?.service_slug ?? '').replace(/-/g, ' '),
    rating,
    testimonial,
    published: false,
    approved_at: null,
  };

  const { error } = await admin.from('customer_reviews').insert(row);
  return redirectBack(request, appointmentId, !error);
}
