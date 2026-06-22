import type { SupabaseClient } from '@supabase/supabase-js';

export type MemorySearchHit = {
  id: string;
  kind: string;
  title: string;
  snippet: string;
  occurredAt: string;
  href?: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function tokenizeQuery(q: string) {
  return q
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function matchesText(text: string, tokens: string[]) {
  const hay = text.toLowerCase();
  return tokens.length === 0 || tokens.some((t) => hay.includes(t));
}

export async function searchBusinessMemory(admin: SupabaseClient, query: string, limit = 20): Promise<MemorySearchHit[]> {
  const tokens = tokenizeQuery(query);
  const q = query.trim();
  const hits: MemorySearchHit[] = [];

  const ilike = tokens[0] ? `%${tokens[0]}%` : `%${q.slice(0, 40)}%`;

  const [notes, messagesRes, reviews, leads, estimates, timeline] = await Promise.all([
    admin.from('customer_notes').select('id, body, created_at, customer_id').ilike('body', ilike).order('created_at', { ascending: false }).limit(30),
    admin.from('messages').select('id, subject, body, created_at').order('created_at', { ascending: false }).limit(80),
    admin
      .from('customer_reviews')
      .select('id, testimonial, customer_name, created_at, customer_id')
      .ilike('testimonial', ilike)
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('leads').select('id, name, notes, email, created_at').ilike('notes', ilike).order('created_at', { ascending: false }).limit(20),
    admin.from('service_estimates').select('id, notes, customer_name, created_at, access_token').ilike('notes', ilike).limit(20),
    admin
      .from('job_timeline_events')
      .select('id, event_type, meta, created_at, appointment_id')
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  for (const row of notes.data ?? []) {
    const n = row as Record<string, unknown>;
    const body = str(n.body);
    if (!matchesText(body, tokens) && tokens.length) continue;
    hits.push({
      id: `note:${n.id}`,
      kind: 'note',
      title: 'Customer note',
      snippet: body.slice(0, 160),
      occurredAt: str(n.created_at),
      href: n.customer_id ? `/admin/customers/${n.customer_id}` : undefined,
    });
  }

  for (const row of messagesRes.data ?? []) {
    const m = row as Record<string, unknown>;
    const text = `${str(m.subject)} ${str(m.body)}`;
    if (!matchesText(text, tokens) && tokens.length) continue;
    hits.push({
      id: `msg:${m.id}`,
      kind: 'message',
      title: str(m.subject) || 'Message',
      snippet: str(m.body).slice(0, 160),
      occurredAt: str(m.created_at),
      href: '/admin/messages',
    });
  }

  for (const row of reviews.data ?? []) {
    const r = row as Record<string, unknown>;
    const text = str(r.testimonial);
    if (!matchesText(text, tokens) && tokens.length) continue;
    hits.push({
      id: `review:${r.id}`,
      kind: 'review',
      title: `Review — ${str(r.customer_name) || 'Customer'}`,
      snippet: text.slice(0, 160),
      occurredAt: str(r.created_at),
      href: r.customer_id ? `/admin/customers/${r.customer_id}` : undefined,
    });
  }

  for (const row of leads.data ?? []) {
    const l = row as Record<string, unknown>;
    const text = `${str(l.name)} ${str(l.notes)}`;
    if (!matchesText(text, tokens) && tokens.length) continue;
    hits.push({
      id: `lead:${l.id}`,
      kind: 'lead',
      title: `Lead — ${str(l.name)}`,
      snippet: str(l.notes).slice(0, 160),
      occurredAt: str(l.created_at),
      href: '/admin/leads',
    });
  }

  for (const row of estimates.data ?? []) {
    const e = row as Record<string, unknown>;
    const text = `${str(e.customer_name)} ${str(e.notes)}`;
    if (!matchesText(text, tokens) && tokens.length) continue;
    hits.push({
      id: `estimate:${e.id}`,
      kind: 'estimate',
      title: `Estimate — ${str(e.customer_name)}`,
      snippet: str(e.notes).slice(0, 160),
      occurredAt: str(e.created_at),
      href: e.access_token ? `/estimate/${e.access_token}` : '/admin/leads',
    });
  }

  for (const row of timeline.data ?? []) {
    const t = row as Record<string, unknown>;
    const meta = t.meta && typeof t.meta === 'object' ? JSON.stringify(t.meta) : '';
    const text = `${str(t.event_type)} ${meta}`;
    if (!matchesText(text, tokens) && tokens.length) continue;
    hits.push({
      id: `timeline:${t.id}`,
      kind: 'job_event',
      title: str(t.event_type).replace(/_/g, ' '),
      snippet: meta.slice(0, 160) || 'Job timeline event',
      occurredAt: str(t.created_at),
      href: t.appointment_id ? `/tech/work-orders/${t.appointment_id}` : undefined,
    });
  }

  hits.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return hits.slice(0, limit);
}

export async function searchMemoryForCustomerName(admin: SupabaseClient, nameQuery: string): Promise<MemorySearchHit[]> {
  const q = nameQuery.trim();
  if (!q) return [];

  const { data: customers } = await admin
    .from('customers')
    .select('id, full_name, email')
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(5);

  const hits: MemorySearchHit[] = [];
  for (const c of customers ?? []) {
    const row = c as { id: string; full_name?: string; email?: string };
    const cid = str(row.id);
    const [notes, appts] = await Promise.all([
      admin.from('customer_notes').select('id, body, created_at').eq('customer_id', cid).order('created_at', { ascending: false }).limit(5),
      admin
        .from('appointments')
        .select('id, status, scheduled_start')
        .eq('customer_id', cid)
        .order('scheduled_start', { ascending: false })
        .limit(5),
    ]);

    const cancelled = (appts.data ?? []).filter((a) => str((a as { status?: string }).status).toLowerCase() === 'cancelled').length;
    const completed = (appts.data ?? []).filter((a) => str((a as { status?: string }).status).toLowerCase() === 'completed').length;

    hits.push({
      id: `customer:${cid}`,
      kind: 'customer',
      title: str(row.full_name) || str(row.email),
      snippet: `${completed} completed · ${cancelled} cancelled · ${notes.data?.length ?? 0} notes on file`,
      occurredAt: new Date().toISOString(),
      href: `/admin/customers/${cid}`,
    });

    for (const n of notes.data ?? []) {
      const note = n as Record<string, unknown>;
      hits.push({
        id: `note:${note.id}`,
        kind: 'note',
        title: 'Note',
        snippet: str(note.body).slice(0, 160),
        occurredAt: str(note.created_at),
        href: `/admin/customers/${cid}`,
      });
    }
  }

  return hits;
}
