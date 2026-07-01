'use server';

import { revalidatePath } from 'next/cache';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function createCalendarBlockAction(formData: FormData): Promise<{ ok: boolean; error?: string; message?: string }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Admin database client unavailable.' };

  const dayKey = str(formData.get('dayKey'));
  const title = str(formData.get('title')) || 'Blocked time';
  const startTime = str(formData.get('startTime')) || '09:00';
  const endTime = str(formData.get('endTime')) || '17:00';
  const note = str(formData.get('note'));
  const blocksBooking = formData.get('blocksBooking') !== 'false';

  if (!dayKey) return { ok: false, error: 'Date is required.' };

  const startAt = new Date(`${dayKey}T${startTime}:00-05:00`).toISOString();
  const endAt = new Date(`${dayKey}T${endTime}:00-05:00`).toISOString();
  if (Number.isNaN(new Date(startAt).getTime()) || Number.isNaN(new Date(endAt).getTime())) {
    return { ok: false, error: 'Invalid start or end time.' };
  }
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    return { ok: false, error: 'End time must be after start time.' };
  }

  const { error } = await admin.from('booking_availability_blocks').insert({
    title,
    notes: note || null,
    start_at: startAt,
    end_at: endAt,
    blocks_booking: blocksBooking,
    source: 'manual',
    updated_at: new Date().toISOString(),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/calendar');
  revalidatePath('/admin');
  return { ok: true, message: 'Time block saved — public booking slots updated.' };
}

export async function deleteCalendarBlockAction(blockId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Admin database client unavailable.' };
  const id = str(blockId).replace(/^block-/, '');
  if (!id) return { ok: false, error: 'Block id required.' };

  const { data: row } = await admin
    .from('booking_availability_blocks')
    .select('source, appointment_id')
    .eq('id', id)
    .maybeSingle();

  if (!row) return { ok: false, error: 'Block not found.' };
  if (row.source === 'titan_appointment' && row.appointment_id) {
    return { ok: false, error: 'Titan booking blocks are managed via reschedule or cancel on the work order.' };
  }

  const { error } = await admin.from('booking_availability_blocks').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/calendar');
  revalidatePath('/admin');
  return { ok: true };
}
