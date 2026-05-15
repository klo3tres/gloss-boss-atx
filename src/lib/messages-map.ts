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

  return { id, from_name, from_email, from_phone, subject, body, status, created_at };
}

export const MESSAGE_SELECT_LEAN =
  'id, from_name, name, from_email, subject, body, from_phone, status, created_at';
export const MESSAGE_SELECT_FALLBACK = 'id, name, email, message, status, created_at';
