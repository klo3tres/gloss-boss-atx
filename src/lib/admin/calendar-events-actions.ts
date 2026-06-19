'use server';

import { revalidatePath } from 'next/cache';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

type CalendarEvent = {
  id: string;
  dayKey: string;
  title: string;
  note: string;
  createdAt: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function parseEvents(raw: unknown): CalendarEvent[] {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const rows = Array.isArray(value) ? value : Array.isArray((value as { events?: unknown[] })?.events) ? (value as { events: unknown[] }).events : [];
    return rows
      .map((event: any) => ({
        id: str(event.id),
        dayKey: str(event.dayKey),
        title: str(event.title),
        note: str(event.note),
        createdAt: str(event.createdAt),
      }))
      .filter((event) => event.id && event.dayKey && event.title);
  } catch {
    return [];
  }
}

export async function addCalendarEventAction(formData: FormData): Promise<{ ok: boolean; error?: string; message?: string }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Admin database client unavailable.' };
  const dayKey = str(formData.get('dayKey'));
  const title = str(formData.get('title'));
  const note = str(formData.get('note'));
  if (!dayKey) return { ok: false, error: 'Missing calendar date.' };
  if (!title) return { ok: false, error: 'Event title is required.' };

  const current = await admin.from('site_settings').select('value').eq('key', 'calendar_events').maybeSingle();
  const events = parseEvents(current.data?.value);
  events.unshift({
    id: crypto.randomUUID(),
    dayKey,
    title,
    note,
    createdAt: new Date().toISOString(),
  });
  const payload = JSON.stringify({ events: events.slice(0, 300) });
  const { error } = await admin.from('site_settings').upsert({ key: 'calendar_events', value: payload, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin');
  revalidatePath('/admin/super');
  return { ok: true, message: 'Calendar event added.' };
}
