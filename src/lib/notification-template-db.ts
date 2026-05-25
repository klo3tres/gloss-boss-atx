import type { SupabaseClient } from '@supabase/supabase-js';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isSchemaDrift(msg: string): boolean {
  return /column|does not exist|schema cache|Could not find|PGRST204/i.test(msg);
}

export type NotificationTemplateRow = {
  id: string;
  template_key: string;
  channel: string;
  name: string;
  subject: string;
  body: string;
  enabled: boolean;
};

export function normalizeNotificationTemplateRow(row: Record<string, unknown>): NotificationTemplateRow {
  const key = str(row.template_key);
  const active = row.active !== false;
  const enabled = row.enabled !== false && row.enabled !== null ? row.enabled !== false : active;
  return {
    id: str(row.id),
    template_key: key,
    channel: str(row.channel) || 'email',
    name: str(row.name) || key.replace(/_/g, ' '),
    subject: str(row.subject),
    body: str(row.body),
    enabled: Boolean(enabled),
  };
}

/** Insert/update with drift tolerance (000044 active-only vs 000047 name/enabled). */
export async function upsertNotificationTemplate(
  admin: SupabaseClient,
  input: {
    template_key: string;
    channel: string;
    name: string;
    subject: string | null;
    body: string;
    enabled: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { template_key, channel, name, subject, body, enabled } = input;
  const { data: existing } = await admin
    .from('notification_templates')
    .select('id')
    .eq('template_key', template_key)
    .eq('channel', channel)
    .maybeSingle();

  const variants: Record<string, unknown>[] = [
    {
      template_key,
      channel,
      name,
      subject: subject || null,
      body,
      enabled,
      active: enabled,
      updated_at: new Date().toISOString(),
    },
    {
      template_key,
      channel,
      name,
      subject: subject || null,
      body,
      enabled,
      updated_at: new Date().toISOString(),
    },
    {
      template_key,
      channel,
      subject: subject || null,
      body,
      active: enabled,
      updated_at: new Date().toISOString(),
    },
    {
      template_key,
      channel,
      subject: subject || null,
      body,
      updated_at: new Date().toISOString(),
    },
  ];

  for (const row of variants) {
    if (existing?.id) {
      const { error } = await admin.from('notification_templates').update(row).eq('id', existing.id);
      if (!error) return { ok: true };
      if (!isSchemaDrift(error.message)) return { ok: false, error: error.message };
    } else {
      const { error } = await admin.from('notification_templates').insert(row);
      if (!error) return { ok: true };
      if (!/duplicate|unique/i.test(error.message) && !isSchemaDrift(error.message)) {
        return { ok: false, error: error.message };
      }
      if (/duplicate|unique/i.test(error.message)) {
        const { error: upErr } = await admin
          .from('notification_templates')
          .update(row)
          .eq('template_key', template_key)
          .eq('channel', channel);
        if (!upErr) return { ok: true };
        if (!isSchemaDrift(upErr.message)) return { ok: false, error: upErr.message };
      }
    }
  }

  return { ok: false, error: 'Could not save notification template (schema mismatch).' };
}

export async function countNotificationTemplates(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin.from('notification_templates').select('id', { count: 'exact', head: true });
  if (error) return 0;
  return count ?? 0;
}
