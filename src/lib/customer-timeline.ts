import type { SupabaseClient } from '@supabase/supabase-js';
import { workOrderPath } from '@/lib/work-order-links';
import { displayMoney } from '@/lib/display-format';

export type CustomerTimelineKind =
  | 'booking'
  | 'job'
  | 'payment'
  | 'receipt'
  | 'message'
  | 'notification'
  | 'review'
  | 'photo'
  | 'note'
  | 'agreement'
  | 'intake'
  | 'lead'
  | 'follow_up'
  | 'estimate'
  | 'loyalty'
  | 'credit'
  | 'system';

export type CustomerTimelineEvent = {
  id: string;
  kind: CustomerTimelineKind;
  occurredAt: string;
  title: string;
  detail?: string;
  href?: string;
};

export type CustomerTimelineBundle = {
  events: CustomerTimelineEvent[];
  appointmentIds: string[];
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function woHref(id: string) {
  return workOrderPath(id, { shell: 'admin', source: 'appointment' });
}

function pushEvent(list: CustomerTimelineEvent[], event: CustomerTimelineEvent | null) {
  if (event && event.occurredAt) list.push(event);
}

function notificationTitle(kind: string, templateKey: string | null, channel: string | null): string {
  const k = kind.toLowerCase();
  const t = (templateKey ?? '').toLowerCase();
  if (k.includes('follow') || t.includes('follow')) return 'Follow-up sent';
  if (k.includes('reminder') || t.includes('reminder')) return 'Reminder sent';
  if (k.includes('receipt')) return 'Receipt delivered';
  if (k.includes('review')) return 'Review request sent';
  if (channel === 'sms') return 'SMS sent';
  if (channel === 'email') return 'Email sent';
  return kind.replace(/_/g, ' ') || 'Notification sent';
}

function jobTimelineTitle(eventType: string): string {
  const t = eventType.toLowerCase();
  if (t === 'job_started') return 'Job started';
  if (t === 'job_completed') return 'Job completed on site';
  if (t === 'payment_received') return 'Payment recorded on job';
  if (t === 'photo_before') return 'Before photos uploaded';
  if (t === 'photo_after') return 'After photos uploaded';
  if (t === 'intake_submitted') return 'Intake submitted';
  if (t === 'custom_sms_sent') return 'Technician SMS sent';
  return eventType.replace(/_/g, ' ');
}

export async function loadCustomerTimeline(
  admin: SupabaseClient,
  customerId: string,
  customer: { email?: string | null; phone?: string | null; full_name?: string | null },
): Promise<CustomerTimelineBundle> {
  const custEmail = str(customer.email).toLowerCase();
  const custPhone = str(customer.phone).replace(/\D/g, '');

  const [apptsRes, apptsByEmailRes, apptsByPhoneRes] = await Promise.all([
    admin
      .from('appointments')
      .select(
        'id, status, payment_status, scheduled_start, service_slug, vehicle_description, base_price_cents, created_at, job_completed_at, updated_at, guest_name',
      )
      .eq('customer_id', customerId)
      .limit(120),
    custEmail
      ? admin
          .from('appointments')
          .select(
            'id, status, payment_status, scheduled_start, service_slug, vehicle_description, base_price_cents, created_at, job_completed_at, updated_at, guest_name',
          )
          .eq('guest_email', custEmail)
          .limit(120)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    custPhone
      ? admin
          .from('appointments')
          .select(
            'id, status, payment_status, scheduled_start, service_slug, vehicle_description, base_price_cents, created_at, job_completed_at, updated_at, guest_name',
          )
          .eq('guest_phone', custPhone)
          .limit(120)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const apptMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(apptsRes.data ?? []), ...(apptsByEmailRes.data ?? []), ...(apptsByPhoneRes.data ?? [])]) {
    const r = row as Record<string, unknown>;
    if (r.id) apptMap.set(String(r.id), r);
  }
  const apptRows = [...apptMap.values()];
  const apptIds = apptRows.map((a) => String(a.id));

  async function loadMessages(): Promise<Record<string, unknown>[]> {
    const map = new Map<string, Record<string, unknown>>();
    if (custEmail) {
      const byEmail = await admin
        .from('messages')
        .select('id, subject, body, status, created_at, from_email, appointment_id')
        .eq('from_email', custEmail)
        .order('created_at', { ascending: false })
        .limit(80);
      for (const row of byEmail.data ?? []) map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
    if (apptIds.length > 0) {
      const byAppt = await admin
        .from('messages')
        .select('id, subject, body, status, created_at, from_email, appointment_id')
        .in('appointment_id', apptIds)
        .order('created_at', { ascending: false })
        .limit(80);
      for (const row of byAppt.data ?? []) map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
    return [...map.values()];
  }

  async function loadNotifications(): Promise<Record<string, unknown>[]> {
    const map = new Map<string, Record<string, unknown>>();
    const byCustomer = await admin
      .from('notification_outbox')
      .select('id, kind, template_key, channel, status, created_at, sent_at, appointment_id, payload')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(120);
    for (const row of byCustomer.data ?? []) map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    if (apptIds.length > 0) {
      const byAppt = await admin
        .from('notification_outbox')
        .select('id, kind, template_key, channel, status, created_at, sent_at, appointment_id, payload')
        .in('appointment_id', apptIds)
        .order('created_at', { ascending: false })
        .limit(120);
      for (const row of byAppt.data ?? []) map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
    return [...map.values()];
  }

  const [messageRows, notificationRows, notesRes, paymentsRes, receiptsRes, reviewsRes, agreementsRes, intakeRes, leadsRes, timelineRes, mediaRes, stampsRes, creditsRes, estimatesRes] =
    await Promise.all([
    loadMessages(),
    loadNotifications(),
    admin.from('customer_notes').select('id, body, created_at').eq('customer_id', customerId).limit(80),
    apptIds.length
      ? admin
          .from('payments')
          .select('id, amount_cents, status, payment_method, payment_kind, paid_at, created_at, appointment_id, refunded_amount_cents')
          .in('appointment_id', apptIds)
          .limit(200)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    apptIds.length
      ? admin.from('receipts').select('id, created_at, appointment_id, total_cents, metadata').in('appointment_id', apptIds).limit(120)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from('customer_reviews')
      .select('id, rating, testimonial, service_label, created_at, appointment_id, published')
      .or(
        [
          `customer_id.eq.${customerId}`,
          custEmail ? `customer_email.eq.${custEmail}` : '',
          apptIds.length ? `appointment_id.in.(${apptIds.join(',')})` : '',
        ]
          .filter(Boolean)
          .join(','),
      )
      .limit(40),
    apptIds.length
      ? admin.from('signed_agreements').select('id, signed_at, appointment_id').in('appointment_id', apptIds).limit(80)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from('intake_submissions')
      .select('id, created_at, appointment_id')
      .or(
        [`customer_id.eq.${customerId}`, apptIds.length ? `appointment_id.in.(${apptIds.join(',')})` : ''].filter(Boolean).join(','),
      )
      .limit(80),
    custEmail
      ? admin.from('leads').select('id, name, email, status, created_at, notes').ilike('email', custEmail).limit(40)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    apptIds.length
      ? admin
          .from('job_timeline_events')
          .select('id, event_type, created_at, appointment_id, meta')
          .in('appointment_id', apptIds)
          .limit(200)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from('job_media')
      .select('id, created_at, appointment_id, photo_category, category, customer_safe_caption')
      .or(
        [`customer_id.eq.${customerId}`, apptIds.length ? `appointment_id.in.(${apptIds.join(',')})` : ''].filter(Boolean).join(','),
      )
      .order('created_at', { ascending: false })
      .limit(80),
    admin.from('loyalty_stamps').select('id, stamp_count, reason, created_at, appointment_id, voided').eq('customer_id', customerId).limit(60),
    admin.from('customer_credits').select('id, amount_cents, type, reason, issued_at, status').eq('customer_id', customerId).limit(40),
    admin
      .from('service_estimates')
      .select('id, status, total_cents, deposit_cents, sent_at, approved_at, deposit_paid_at, created_at, access_token, appointment_id')
      .or(`customer_id.eq.${customerId}${custEmail ? `,customer_email.eq.${custEmail}` : ''}`)
      .limit(40),
  ]);

  const events: CustomerTimelineEvent[] = [];

  for (const row of apptRows) {
    const id = String(row.id);
    const service = str(row.service_slug).replace(/-/g, ' ') || 'Service';
    const vehicle = str(row.vehicle_description);
    const status = str(row.status).toLowerCase();
    const createdAt = str(row.created_at);
    const scheduled = str(row.scheduled_start);
    const completedAt = str(row.job_completed_at) || (status === 'completed' ? str(row.updated_at) : '');

    pushEvent(events, {
      id: `appt:booked:${id}`,
      kind: 'booking',
      occurredAt: createdAt || scheduled,
      title: 'Customer booked',
      detail: [service, vehicle].filter(Boolean).join(' · '),
      href: woHref(id),
    });

    if (scheduled) {
      pushEvent(events, {
        id: `appt:scheduled:${id}`,
        kind: 'job',
        occurredAt: scheduled,
        title: 'Job scheduled',
        detail: service,
        href: woHref(id),
      });
    }

    if (status === 'completed' && completedAt) {
      pushEvent(events, {
        id: `appt:completed:${id}`,
        kind: 'job',
        occurredAt: completedAt,
        title: 'Vehicle serviced',
        detail: [service, vehicle].filter(Boolean).join(' · '),
        href: woHref(id),
      });
    } else if (status === 'cancelled' || status === 'canceled') {
      pushEvent(events, {
        id: `appt:cancelled:${id}`,
        kind: 'job',
        occurredAt: str(row.updated_at) || scheduled || createdAt,
        title: 'Booking cancelled',
        detail: service,
        href: woHref(id),
      });
    }

    const payStatus = str(row.payment_status).toLowerCase();
    if (payStatus.includes('deposit') && payStatus.includes('paid')) {
      pushEvent(events, {
        id: `appt:deposit-status:${id}`,
        kind: 'payment',
        occurredAt: scheduled || createdAt,
        title: 'Deposit marked paid',
        detail: service,
        href: woHref(id),
      });
    }
  }

  for (const row of paymentsRes.data ?? []) {
    const p = row as Record<string, unknown>;
    const st = str(p.status).toLowerCase();
    if (st !== 'succeeded' && st !== 'paid') continue;
    const amount = Math.max(0, cents(p.amount_cents) - cents(p.refunded_amount_cents));
    if (amount <= 0) continue;
    const kind = str(p.payment_kind).toLowerCase();
    pushEvent(events, {
      id: `payment:${p.id}`,
      kind: 'payment',
      occurredAt: str(p.paid_at) || str(p.created_at),
      title: kind === 'deposit' ? 'Deposit paid' : kind === 'balance' ? 'Balance paid' : 'Payment received',
      detail: `${displayMoney(amount)}${str(p.payment_method) ? ` · ${str(p.payment_method)}` : ''}`,
      href: p.appointment_id ? woHref(String(p.appointment_id)) : `/admin/payments/${p.id}`,
    });
  }

  for (const row of receiptsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    pushEvent(events, {
      id: `receipt:${r.id}`,
      kind: 'receipt',
      occurredAt: str(r.created_at),
      title: 'Receipt generated',
      detail: cents(r.total_cents) > 0 ? displayMoney(cents(r.total_cents)) : undefined,
      href: `/admin/receipts/${r.id}`,
    });
  }

  for (const row of messageRows) {
    const m = row as Record<string, unknown>;
    pushEvent(events, {
      id: `message:${m.id}`,
      kind: 'message',
      occurredAt: str(m.created_at),
      title: str(m.subject) || 'Customer message',
      detail: str(m.body).slice(0, 160) || undefined,
      href: '/admin/messages',
    });
  }

  for (const row of notificationRows) {
    const n = row as Record<string, unknown>;
    const kind = str(n.kind);
    const templateKey = str(n.template_key) || null;
    const channel = str(n.channel) || null;
    const isFollowUp = kind.includes('follow') || templateKey?.includes('follow');
    pushEvent(events, {
      id: `notification:${n.id}`,
      kind: isFollowUp ? 'follow_up' : 'notification',
      occurredAt: str(n.sent_at) || str(n.created_at),
      title: notificationTitle(kind, templateKey, channel),
      detail: [channel, str(n.status)].filter(Boolean).join(' · ') || undefined,
      href: n.appointment_id ? woHref(String(n.appointment_id)) : '/admin/notifications',
    });
  }

  for (const row of reviewsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    pushEvent(events, {
      id: `review:${r.id}`,
      kind: 'review',
      occurredAt: str(r.created_at),
      title: `Review submitted · ${cents(r.rating) || 5}★`,
      detail: str(r.testimonial).slice(0, 160) || str(r.service_label) || undefined,
      href: r.appointment_id ? woHref(String(r.appointment_id)) : undefined,
    });
  }

  for (const row of agreementsRes.data ?? []) {
    const a = row as Record<string, unknown>;
    pushEvent(events, {
      id: `agreement:${a.id}`,
      kind: 'agreement',
      occurredAt: str(a.signed_at) || str(a.id),
      title: 'Agreement signed',
      href: a.appointment_id ? woHref(String(a.appointment_id)) : undefined,
    });
  }

  for (const row of intakeRes.data ?? []) {
    const i = row as Record<string, unknown>;
    pushEvent(events, {
      id: `intake:${i.id}`,
      kind: 'intake',
      occurredAt: str(i.created_at),
      title: 'Vehicle intake completed',
      href: i.appointment_id ? woHref(String(i.appointment_id)) : undefined,
    });
  }

  for (const row of leadsRes.data ?? []) {
    const l = row as Record<string, unknown>;
    pushEvent(events, {
      id: `lead:${l.id}`,
      kind: 'lead',
      occurredAt: str(l.created_at),
      title: 'Lead captured',
      detail: [str(l.status), str(l.notes).slice(0, 100)].filter(Boolean).join(' · ') || undefined,
      href: '/admin/leads',
    });
  }

  for (const row of timelineRes.data ?? []) {
    const t = row as Record<string, unknown>;
    const eventType = str(t.event_type);
    if (['photo_before', 'photo_after', 'job_completed', 'payment_received', 'intake_submitted'].includes(eventType)) {
      pushEvent(events, {
        id: `job-event:${t.id}`,
        kind: eventType.startsWith('photo') ? 'photo' : eventType === 'payment_received' ? 'payment' : 'job',
        occurredAt: str(t.created_at),
        title: jobTimelineTitle(eventType),
        href: t.appointment_id ? woHref(String(t.appointment_id)) : undefined,
      });
    }
  }

  for (const row of mediaRes.data ?? []) {
    const m = row as Record<string, unknown>;
    const cat = str(m.photo_category) || str(m.category) || 'photo';
    pushEvent(events, {
      id: `photo:${m.id}`,
      kind: 'photo',
      occurredAt: str(m.created_at),
      title: `${cat.replace(/_/g, ' ')} photo uploaded`,
      detail: str(m.customer_safe_caption) || undefined,
      href: m.appointment_id ? woHref(String(m.appointment_id)) : undefined,
    });
  }

  for (const row of notesRes.data ?? []) {
    const n = row as Record<string, unknown>;
    pushEvent(events, {
      id: `note:${n.id}`,
      kind: 'note',
      occurredAt: str(n.created_at),
      title: 'Staff note added',
      detail: str(n.body).slice(0, 200),
    });
  }

  for (const row of stampsRes.data ?? []) {
    const s = row as Record<string, unknown>;
    if (s.voided) continue;
    pushEvent(events, {
      id: `loyalty:${s.id}`,
      kind: 'loyalty',
      occurredAt: str(s.created_at),
      title: 'Loyalty stamp awarded',
      detail: str(s.reason) || `+${cents(s.stamp_count) || 1} stamp`,
    });
  }

  for (const row of creditsRes.data ?? []) {
    const c = row as Record<string, unknown>;
    pushEvent(events, {
      id: `credit:${c.id}`,
      kind: 'credit',
      occurredAt: str(c.issued_at),
      title: 'Store credit issued',
      detail: `${displayMoney(cents(c.amount_cents))}${str(c.reason) ? ` · ${str(c.reason)}` : ''}`,
    });
  }

  for (const row of estimatesRes.data ?? []) {
    const e = row as Record<string, unknown>;
    const status = str(e.status);
    const titles: Record<string, string> = {
      draft: 'Estimate drafted',
      sent: 'Estimate sent',
      approved: 'Estimate approved',
      declined: 'Estimate declined',
      deposit_paid: 'Estimate deposit paid',
      converted: 'Estimate converted to work order',
    };
    pushEvent(events, {
      id: `estimate:${e.id}:${status}`,
      kind: 'estimate',
      occurredAt: str(e.deposit_paid_at) || str(e.approved_at) || str(e.sent_at) || str(e.created_at),
      title: titles[status] ?? 'Estimate updated',
      detail: displayMoney(cents(e.total_cents)),
      href: e.access_token ? `/estimate/${e.access_token}` : e.appointment_id ? woHref(String(e.appointment_id)) : undefined,
    });
  }

  events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return { events, appointmentIds: apptIds };
}
