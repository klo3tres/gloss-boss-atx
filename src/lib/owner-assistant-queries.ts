import type { SupabaseClient } from '@supabase/supabase-js';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export type AssistantAnswer = { title: string; summary: string; bullets: string[] };

export async function runOwnerAssistantQuery(admin: SupabaseClient, question: string): Promise<AssistantAnswer> {
  const q = question.toLowerCase();

  if (/owe|balance|unpaid|outstanding/.test(q)) {
    const { data } = await admin
      .from('appointments')
      .select('id, guest_name, guest_email, scheduled_start, base_price_cents, payment_status')
      .not('status', 'eq', 'cancelled')
      .order('scheduled_start', { ascending: true })
      .limit(200);
    const rows = (data ?? []) as Record<string, unknown>[];
    const owing = rows.filter((r) => {
      const ps = str(r.payment_status);
      return ps.includes('balance') || ps.includes('deposit') || ps === 'pending' || ps === 'pay_later';
    });
    return {
      title: 'Who owes money',
      summary: `${owing.length} open job(s) may have balance due (check work order totals for exact cents).`,
      bullets: owing.slice(0, 12).map((r) => {
        const when = str(r.scheduled_start).slice(0, 10);
        return `${str(r.guest_name) || 'Guest'} · ${when} · ${str(r.payment_status)} · WO ${str(r.id).slice(0, 8)}`;
      }),
    };
  }

  if (/week|today|schedule|job/.test(q)) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const { data } = await admin
      .from('appointments')
      .select('guest_name, scheduled_start, status, service_address')
      .gte('scheduled_start', start.toISOString())
      .lt('scheduled_start', end.toISOString())
      .not('status', 'eq', 'cancelled')
      .order('scheduled_start', { ascending: true });
    const rows = (data ?? []) as Record<string, unknown>[];
    return {
      title: 'Jobs this week',
      summary: `${rows.length} appointment(s) in the next 7 days.`,
      bullets: rows.slice(0, 15).map((r) => {
        const d = new Date(str(r.scheduled_start));
        const when = Number.isNaN(d.getTime())
          ? str(r.scheduled_start)
          : d.toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        return `${when} — ${str(r.guest_name)} · ${str(r.status)}`;
      }),
    };
  }

  if (/mileage|miles|drive/.test(q)) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { data } = await admin.from('job_mileage_logs').select('*').gte('created_at', monthStart.toISOString());
    let total = 0;
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const rt = typeof r.round_trip_miles === 'number' ? r.round_trip_miles : null;
      const tm = typeof r.total_miles === 'number' ? r.total_miles : typeof r.estimated_miles === 'number' ? r.estimated_miles : 0;
      total += rt ?? tm;
    }
    return {
      title: 'Mileage this month',
      summary: `${total.toFixed(1)} round-trip miles logged since ${monthStart.toLocaleDateString('en-US')}.`,
      bullets: ['Export CSV from Admin → Operations → Export monthly CSV for tax records.'],
    };
  }

  if (/jarvis|ai|assistant|performance/.test(q)) {
    return {
      title: 'Jarvis / AI performance',
      summary: 'In-site AI assistant is live for quick ops questions. Full Jarvis analytics coming in a later release.',
      bullets: [
        'Try: “who owes money”, “jobs this week”, “mileage this month”.',
        'Payment debug events: Admin → Integrations / System status.',
      ],
    };
  }

  return {
    title: 'Gloss Boss assistant',
    summary: 'Ask about balances, this week’s jobs, or monthly mileage.',
    bullets: [
      'Who owes money?',
      'Jobs this week?',
      'Mileage this month?',
      'Jarvis performance?',
    ],
  };
}
