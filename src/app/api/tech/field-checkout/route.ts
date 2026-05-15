import { NextResponse } from 'next/server';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { getAppOrigin } from '@/lib/env/app-origin';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { tryCreateServerSupabase } from '@/lib/supabase/server';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';

export const runtime = 'nodejs';

function isFieldTechRole(role: string | null): boolean {
  return role === 'technician' || role === 'admin' || role === 'super_admin';
}

/**
 * One-off field invoice: Stripe Checkout (payment mode) for walk-up / tech-quoted work.
 */
export async function POST(request: Request) {
  try {
    const supabase = await tryCreateServerSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Server session unavailable' }, { status: 503 });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile, error: pErr } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    let role = parseAppRole(profile?.role);
    if (pErr || !profile?.role) {
      const em = (user.email ?? '').trim().toLowerCase();
      if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
    }
    if (!isFieldTechRole(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = (await request.json()) as {
      amountCents?: number;
      serviceTitle?: string;
      serviceSlug?: string;
      vehicleClass?: string;
      customerEmail?: string;
      customerPhone?: string;
    };

    const amountCents = Math.round(Number(body.amountCents ?? 0));
    if (!Number.isFinite(amountCents) || amountCents < 500 || amountCents > 500_000) {
      return NextResponse.json({ error: 'Amount must be between $5.00 and $5,000.00' }, { status: 400 });
    }

    const title = String(body.serviceTitle ?? 'Field service').trim().slice(0, 120) || 'Field service';
    const slug = String(body.serviceSlug ?? '').trim().slice(0, 80);
    const vehicleClass = String(body.vehicleClass ?? '').trim().slice(0, 40);
    const customerEmail = String(body.customerEmail ?? '').trim() || undefined;
    const customerPhone = String(body.customerPhone ?? '').trim().slice(0, 32);

    const admin = tryCreateAdminSupabase();
    const stripe = await getStripeSdk(admin);
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' }, { status: 503 });
    }

    const origin = getAppOrigin(request);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: customerEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: `Gloss Boss ATX — ${title}`,
              description: [slug && `Package: ${slug}`, vehicleClass && `Vehicle: ${vehicleClass}`, customerPhone && `Phone: ${customerPhone}`]
                .filter(Boolean)
                .join(' · ')
                .slice(0, 500),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/tech?invoice=ok`,
      cancel_url: `${origin}/tech?invoice=cancel`,
      metadata: {
        tech_field_invoice: '1',
        technician_id: user.id,
        service_slug: slug,
        vehicle_class: vehicleClass,
        customer_phone: customerPhone,
      },
    });

    if (!session.url) {
      return NextResponse.json({ error: 'No checkout URL returned' }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.warn('[tech/field-checkout]', e);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
