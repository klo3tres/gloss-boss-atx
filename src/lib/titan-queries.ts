import type { SupabaseClient } from '@supabase/supabase-js';
import { runOwnerAssistantQuery, type AssistantAnswer } from '@/lib/owner-assistant-queries';

export type TitanAnswer = AssistantAnswer & { href?: string };

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function runTitanQuery(admin: SupabaseClient, question: string): Promise<TitanAnswer> {
  const q = question.toLowerCase();

  if (/90|haven.?t booked|not booked|lapsed|inactive|rebook/.test(q)) {
    const since = new Date(Date.now() - 400 * 86400000).toISOString();
    const { data: appts } = await admin
      .from('appointments')
      .select('id, guest_name, guest_email, guest_phone, status, scheduled_start, job_completed_at, updated_at')
      .gte('scheduled_start', since)
      .eq('status', 'completed')
      .limit(2000);

    const rows = (appts ?? []) as Record<string, unknown>[];
    const lapsed: Record<string, unknown>[] = [];

    for (const row of rows) {
      const email = str(row.guest_email).toLowerCase();
      const phone = str(row.guest_phone).replace(/\D/g, '');
      const completedAt = new Date(str(row.job_completed_at) || str(row.updated_at)).getTime();
      const daysSince = (Date.now() - completedAt) / 86400000;
      if (daysSince < 90) continue;

      const hasFuture = rows.some((other) => {
        if (str(other.id) === str(row.id)) return false;
        if (!['scheduled', 'confirmed', 'in_progress', 'deposit_paid'].includes(str(other.status).toLowerCase())) return false;
        if (new Date(str(other.scheduled_start)).getTime() <= Date.now()) return false;
        const oe = str(other.guest_email).toLowerCase();
        const op = str(other.guest_phone).replace(/\D/g, '');
        return (email && oe === email) || (phone.length >= 10 && op === phone);
      });
      if (hasFuture) continue;
      lapsed.push(row);
    }

    const unique = new Map<string, Record<string, unknown>>();
    for (const row of lapsed) {
      const key = str(row.guest_email).toLowerCase() || str(row.guest_phone) || str(row.id);
      if (!unique.has(key)) unique.set(key, row);
    }
    const list = [...unique.values()];

    return {
      title: 'Customers without a booking in 90+ days',
      summary: `${list.length} completed customer(s) are past due for a maintenance follow-up.`,
      bullets: list.slice(0, 15).map((r) => {
        const days = Math.floor((Date.now() - new Date(str(r.job_completed_at) || str(r.updated_at)).getTime()) / 86400000);
        return `${str(r.guest_name) || 'Customer'} · last service ${days}d ago`;
      }),
      href: '/admin/follow-ups',
    };
  }

  if (/500|high.?value|top customer|best customer|spent over|lifetime/.test(q)) {
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const { data: payments } = await admin
      .from('payments')
      .select('amount_cents, appointment_id, customer_id, status')
      .gte('created_at', since)
      .in('status', ['succeeded', 'paid', 'completed'])
      .limit(3000);

    const byCustomer = new Map<string, { cents: number; customerId: string | null }>();
    for (const row of payments ?? []) {
      const p = row as Record<string, unknown>;
      const key = str(p.customer_id) || str(p.appointment_id) || 'unknown';
      const prev = byCustomer.get(key) ?? { cents: 0, customerId: str(p.customer_id) || null };
      prev.cents += cents(p.amount_cents);
      byCustomer.set(key, prev);
    }

    const threshold = /500/.test(q) ? 50000 : 30000;
    const ranked = [...byCustomer.entries()]
      .filter(([, v]) => v.cents >= threshold)
      .sort((a, b) => b[1].cents - a[1].cents);

    const apptIds = ranked.map(([k]) => k).filter((k) => k.length > 20);
    const names = new Map<string, string>();
    if (apptIds.length) {
      const { data: appts } = await admin.from('appointments').select('id, guest_name, guest_email').in('id', apptIds.slice(0, 50));
      for (const a of appts ?? []) {
        names.set(str((a as { id: string }).id), str((a as { guest_name?: string }).guest_name) || str((a as { guest_email?: string }).guest_email));
      }
    }

    return {
      title: `High-value customers ($${threshold / 100}+)`,
      summary: `${ranked.length} customer(s) crossed your spend threshold in the last 12 months.`,
      bullets: ranked.slice(0, 12).map(([key, v]) => {
        const label = names.get(key) || (v.customerId ? `Customer ${v.customerId.slice(0, 8)}` : key.slice(0, 8));
        return `${label} · $${(v.cents / 100).toFixed(0)} lifetime`;
      }),
      href: '/admin/customers',
    };
  }

  if (/profitable|most money|top service|best service|revenue by service/.test(q)) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data: payments } = await admin
      .from('payments')
      .select('amount_cents, appointment_id, status')
      .gte('created_at', monthStart.toISOString())
      .in('status', ['succeeded', 'paid', 'completed'])
      .limit(2000);

    const apptIds = [...new Set((payments ?? []).map((p) => str((p as { appointment_id?: string }).appointment_id)).filter(Boolean))];
    const { data: appts } = apptIds.length
      ? await admin.from('appointments').select('id, service_slug').in('id', apptIds.slice(0, 500))
      : { data: [] };

    const slugById = new Map((appts ?? []).map((a) => [str((a as { id: string }).id), str((a as { service_slug?: string }).service_slug)]));
    const bySlug = new Map<string, number>();
    for (const row of payments ?? []) {
      const p = row as Record<string, unknown>;
      const slug = slugById.get(str(p.appointment_id)) || 'other';
      bySlug.set(slug, (bySlug.get(slug) ?? 0) + cents(p.amount_cents));
    }

    const ranked = [...bySlug.entries()].sort((a, b) => b[1] - a[1]);
    return {
      title: 'Most profitable services (this month)',
      summary: ranked.length ? `Top package: ${ranked[0][0].replace(/-/g, ' ')} at $${(ranked[0][1] / 100).toFixed(0)}.` : 'No payment data yet this month.',
      bullets: ranked.slice(0, 8).map(([slug, rev]) => `${slug.replace(/-/g, ' ')} · $${(rev / 100).toFixed(0)}`),
      href: '/admin/revenue',
    };
  }

  if (/follow.?up|overdue|maintenance/.test(q)) {
    const probe = await admin.from('customer_follow_ups').select('id').limit(1);
    if (probe.error) {
      return {
        title: 'Follow-up queue',
        summary: 'Apply migration 000086 to enable the follow-up engine, or use Exception inbox for manual sends.',
        bullets: ['Open /admin/follow-ups after migration'],
        href: '/admin/exceptions',
      };
    }

    const { data, count } = await admin
      .from('customer_follow_ups')
      .select('customer_name, tier, due_at, status', { count: 'exact' })
      .in('status', ['pending', 'failed'])
      .order('due_at', { ascending: true })
      .limit(15);

    return {
      title: 'Follow-ups due',
      summary: `${count ?? 0} follow-up(s) pending in the automated queue.`,
      bullets: (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return `${str(row.customer_name) || 'Customer'} · ${row.tier}d · ${str(row.status)}`;
      }),
      href: '/admin/follow-ups',
    };
  }

  if (/estimate|quote|pipeline/.test(q)) {
    const { data, count } = await admin
      .from('service_estimates')
      .select('customer_name, status, total_cents', { count: 'exact' })
      .in('status', ['draft', 'sent', 'approved'])
      .order('created_at', { ascending: false })
      .limit(12);

    const estProbe = await admin.from('service_estimates').select('id').limit(1);
    if (estProbe.error) {
      return {
        title: 'Estimate pipeline',
        summary: 'Estimate system available after migration 000085.',
        bullets: ['Create estimates from Admin → Leads'],
        href: '/admin/leads',
      };
    }

    return {
      title: 'Open estimates',
      summary: `${count ?? 0} estimate(s) in draft, sent, or approved awaiting deposit.`,
      bullets: (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return `${str(row.customer_name) || 'Customer'} · ${str(row.status)} · $${(cents(row.total_cents) / 100).toFixed(0)}`;
      }),
      href: '/admin/leads',
    };
  }

  if (/focus|week|priority|today|should i/.test(q)) {
    const briefing = await import('@/lib/titan-briefing').then((m) => m.loadTitanBriefing(admin));
    return {
      title: 'Top priorities this week',
      summary: briefing.recommendations[0]?.detail ?? 'Run the business from Exception inbox and Follow-ups.',
      bullets: briefing.recommendations.slice(0, 5).map((r) => r.title),
      href: briefing.recommendations[0]?.href ?? '/admin',
    };
  }

  if (/memory|interaction|history/.test(q)) {
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: notes } = await admin
      .from('customer_notes')
      .select('body, created_at, customer_id')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);

    return {
      title: 'Titan Memory — recent context',
      summary: `${notes?.length ?? 0} customer notes captured in the last 14 days. Full timeline on each customer profile.`,
      bullets: (notes ?? []).map((n) => {
        const row = n as Record<string, unknown>;
        return `${str(row.body).slice(0, 60)}…`;
      }),
      href: '/admin/customers',
    };
  }

  const fallback = await runOwnerAssistantQuery(admin, question);
  return { ...fallback, href: '/admin' };
}
