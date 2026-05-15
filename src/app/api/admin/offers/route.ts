import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function revalidateOfferSurfaces() {
  revalidatePath('/admin/cms');
  revalidatePath('/admin/pricing');
  revalidatePath('/services');
  revalidatePath('/book');
  revalidatePath('/');
}

function normalizeSlug(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return t.slice(0, 80);
}

type Body = {
  id?: string;
  archive?: boolean;
  /** Alias for archive (soft deactivate) */
  delete?: boolean;
  label?: string;
  title?: string;
  description?: string;
  slug?: string;
  percent_off?: number;
  discount_fixed_cents?: number | null;
  active?: boolean;
  stackable?: boolean;
  sort_order?: number;
  show_on_homepage?: boolean;
  show_on_services?: boolean;
  show_on_booking?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
};

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const id = String(body.id ?? '').trim();

  if (id && (body.archive === true || body.delete === true)) {
    const payloads = [
      { archived: true, active: false },
      { active: false },
    ];
    let lastErr: string | null = null;
    for (const p of payloads) {
      const { error } = await admin.from('offers').update(p).eq('id', id);
      if (!error) {
        revalidateOfferSurfaces();
        return NextResponse.json({ ok: true });
      }
      lastErr = error.message;
    }
    return NextResponse.json({ ok: false, error: lastErr ?? 'Archive failed' }, { status: 400 });
  }

  const title = String(body.title ?? body.label ?? '').trim().slice(0, 200);
  const description = String(body.description ?? '').slice(0, 2000);
  const slugIn = typeof body.slug === 'string' ? normalizeSlug(body.slug) : '';
  const slug = slugIn || undefined;

  let discount_fixed: number | null = null;
  if (body.discount_fixed_cents != null) {
    const n = Number(body.discount_fixed_cents);
    if (Number.isFinite(n) && n > 0) discount_fixed = Math.round(Math.min(n, 500_000_00));
  }

  let percent = Math.min(100, Math.max(0, Number(body.percent_off ?? 0)));
  if (discount_fixed != null && discount_fixed > 0) {
    percent = 0;
  } else {
    discount_fixed = null;
  }

  const active = typeof body.active === 'boolean' ? body.active : true;
  const stackable = typeof body.stackable === 'boolean' ? body.stackable : true;
  const sort_order =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order) ? Math.round(body.sort_order) : undefined;

  const show_on_homepage = typeof body.show_on_homepage === 'boolean' ? body.show_on_homepage : true;
  const show_on_services = typeof body.show_on_services === 'boolean' ? body.show_on_services : true;
  const show_on_booking = typeof body.show_on_booking === 'boolean' ? body.show_on_booking : true;

  const starts_at =
    typeof body.starts_at === 'string' && body.starts_at.trim() ? body.starts_at.trim() : null;
  const ends_at = typeof body.ends_at === 'string' && body.ends_at.trim() ? body.ends_at.trim() : null;

  if (!title) {
    return NextResponse.json({ ok: false, error: 'Offer title required' }, { status: 400 });
  }

  if (percent <= 0 && (discount_fixed == null || discount_fixed <= 0)) {
    return NextResponse.json({ ok: false, error: 'Set a percent off or fixed discount amount' }, { status: 400 });
  }

  try {
    if (id) {
      const row: Record<string, unknown> = {
        label: title,
        title,
        description,
        percent_off: percent,
        discount_percent: percent,
        discount_fixed_cents: discount_fixed,
        active,
        archived: false,
        stackable,
        show_on_homepage,
        show_on_services,
        show_on_booking,
        starts_at,
        ends_at,
      };
      if (slug !== undefined) row.slug = slug;
      if (sort_order !== undefined) row.sort_order = sort_order;

      const payloads = [
        row,
        {
          ...row,
          discount_fixed_cents: undefined,
          show_on_homepage: undefined,
          show_on_services: undefined,
          show_on_booking: undefined,
          starts_at: undefined,
          ends_at: undefined,
          archived: undefined,
        },
        {
          label: title,
          title,
          description,
          percent_off: percent,
          discount_percent: percent,
          active,
          stackable,
        },
      ];

      let lastErr: string | null = null;
      for (const p of payloads) {
        const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));
        const { error } = await admin.from('offers').update(clean).eq('id', id);
        if (!error) {
          revalidateOfferSurfaces();
          return NextResponse.json({ ok: true });
        }
        lastErr = error.message;
      }
      return NextResponse.json({ ok: false, error: lastErr ?? 'Update failed' }, { status: 400 });
    }

    const maxQ = await admin.from('offers').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const nextSort =
      sort_order ??
      (!maxQ.error && maxQ.data?.[0] && typeof (maxQ.data[0] as { sort_order?: number }).sort_order === 'number'
        ? Number((maxQ.data[0] as { sort_order: number }).sort_order) + 10
        : 10);

    const insertBase: Record<string, unknown> = {
      label: title,
      title,
      description,
      percent_off: percent,
      discount_percent: percent,
      discount_fixed_cents: discount_fixed,
      active,
      archived: false,
      stackable,
      sort_order: nextSort,
      show_on_homepage,
      show_on_services,
      show_on_booking,
      starts_at,
      ends_at,
    };
    if (slug) insertBase.slug = slug;

    const insertAttempts = [
      insertBase,
      {
        label: title,
        title,
        description,
        percent_off: percent,
        discount_percent: percent,
        active,
        archived: false,
        stackable,
        sort_order: nextSort,
      },
      {
        label: title,
        percent_off: percent,
        active,
        sort_order: nextSort,
      },
    ];

    for (const ins of insertAttempts) {
      const { error } = await admin.from('offers').insert(ins);
      if (!error) {
        revalidateOfferSurfaces();
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ ok: false, error: 'Could not create offer' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Offer save failed' }, { status: 400 });
  }
}
