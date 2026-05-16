/** Resilient mapping for `messages` table schema drift. */

export type MessageRow = {
  id: string;
  from_name: string;
  from_email: string;
  from_phone: string | null;
  subject: string | null;
  body: string;
  status: string;
  created_at: string;
  read_at?: string | null;
  replied_at?: string | null;
  archived_at?: string | null;
};
function str(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v);
}

export function mapMessageRow(raw: Record<string, unknown>): MessageRow | null {
  const id = str(raw.id);
  if (!id) return null;

  const from_name =
    str(raw.from_name) ||
    str(raw.name) ||
    str(raw.sender_name) ||
    str(raw.full_name) ||
    str(raw.email) ||
    'Website visitor';
  const from_email = str(raw.from_email) || str(raw.email) || 'no-email@unknown.local';
  const from_phone = str(raw.from_phone) || str(raw.phone) || null;
  const body = str(raw.body) || str(raw.message) || str(raw.content) || '';
  const subject = str(raw.subject) || null;
  const status = str(raw.status) || 'new';
  const created_at = str(raw.created_at) || new Date().toISOString();

  return {
    id,
    from_name,
    from_email,
    from_phone,
    body,
    subject,
    status,
    created_at,
    read_at: raw.read_at != null ? String(raw.read_at) : null,
    replied_at: raw.replied_at != null ? String(raw.replied_at) : null,
    archived_at: raw.archived_at != null ? String(raw.archived_at) : null,
  };
}

/** Only columns that exist on the default `messages` table — avoid PostgREST schema cache errors. */
export const MESSAGE_SELECT_LEAN = 'id, from_name, from_email, subject, body, message, status, created_at';
export const MESSAGE_SELECT_WITH_PHONE = 'id, from_name, from_email, from_phone, subject, body, message, status, created_at';export const MESSAGE_SELECT_FALLBACK = 'id, name, email, message, status, created_at';
