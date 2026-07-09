import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendResendHtml, resendConfigured } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { logTitanActivity } from '@/lib/titan/activity-feed';
import { businessNotifyDestination } from '@/lib/email-send';
import { logNotificationOutbox } from '@/lib/notification-outbox-log';

export type StaffInviteRole = 'super_admin' | 'admin' | 'dispatcher' | 'technician' | 'viewer';
export type StaffInviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export type StaffInviteRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: StaffInviteRole;
  status: StaffInviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  authUserId: string | null;
  lastSentAt: string | null;
  lastSentChannel: string | null;
  createdAt: string;
};

const INVITE_TTL_DAYS = 7;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

export function inviteLinkForToken(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  return `${base}/join-team?token=${encodeURIComponent(token)}`;
}

function mapInvite(row: Record<string, unknown>): StaffInviteRow {
  return {
    id: str(row.id),
    fullName: str(row.full_name),
    email: str(row.email) || null,
    phone: str(row.phone) || null,
    role: str(row.role) as StaffInviteRole,
    status: str(row.status) as StaffInviteStatus,
    expiresAt: str(row.expires_at),
    acceptedAt: str(row.accepted_at) || null,
    authUserId: str(row.auth_user_id) || null,
    lastSentAt: str(row.last_sent_at) || null,
    lastSentChannel: str(row.last_sent_channel) || null,
    createdAt: str(row.created_at),
  };
}

export async function findPendingInviteByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<StaffInviteRow | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await admin
    .from('staff_invites')
    .select('*')
    .eq('status', 'pending')
    .ilike('email', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? mapInvite(data as Record<string, unknown>) : null;
}

export async function findPendingInviteByProfileEmail(
  admin: SupabaseClient,
  profileEmail: string | null | undefined,
): Promise<StaffInviteRow | null> {
  const email = str(profileEmail).toLowerCase();
  if (!email) return null;
  return findPendingInviteByEmail(admin, email);
}

export async function listStaffInvites(admin: SupabaseClient): Promise<StaffInviteRow[]> {
  const { data, error } = await admin
    .from('staff_invites')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((r) => mapInvite(r as Record<string, unknown>));
}

export async function createStaffInvite(
  admin: SupabaseClient,
  input: {
    invitedBy: string;
    fullName: string;
    email?: string;
    phone?: string;
    role: StaffInviteRole;
  },
): Promise<{ ok: boolean; invite?: StaffInviteRow; token?: string; error?: string }> {
  const token = generateInviteToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

  const { data, error } = await admin
    .from('staff_invites')
    .insert({
      invited_by: input.invitedBy,
      full_name: input.fullName.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      role: input.role,
      token_hash: hashInviteToken(token),
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    })
    .select('*')
    .maybeSingle();

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not create invite.' };
  return { ok: true, invite: mapInvite(data as Record<string, unknown>), token };
}

export async function validateStaffInviteToken(
  admin: SupabaseClient,
  token: string,
): Promise<{ ok: boolean; invite?: StaffInviteRow; error?: string }> {
  const hash = hashInviteToken(token);
  const { data } = await admin.from('staff_invites').select('*').eq('token_hash', hash).maybeSingle();
  if (!data) return { ok: false, error: 'This invite link is invalid or has already been used.' };
  const invite = mapInvite(data as Record<string, unknown>);
  if (invite.status === 'revoked') return { ok: false, error: 'This invite was revoked. Ask your manager for a new link.' };
  if (invite.status === 'accepted') return { ok: false, error: 'This invite was already accepted. Sign in instead.' };
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await admin.from('staff_invites').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', invite.id);
    return { ok: false, error: 'This invite expired. Ask your manager to resend.' };
  }
  return { ok: true, invite };
}

export function roleLabel(role: StaffInviteRole): string {
  const labels: Record<StaffInviteRole, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    dispatcher: 'Dispatcher',
    technician: 'Technician',
    viewer: 'Viewer',
  };
  return labels[role] ?? role;
}

export async function sendStaffInviteNotification(
  admin: SupabaseClient,
  invite: StaffInviteRow,
  token: string,
  channel: 'sms' | 'email' | 'both',
  inviterName: string,
): Promise<{ emailStatus: string; smsStatus: string; emailError?: string; smsError?: string }> {
  const link = inviteLinkForToken(token);
  const role = roleLabel(invite.role);
  const smsBody = `Gloss Boss ATX: ${inviterName} invited you to join the team as ${role}. Set up your account here: ${link}`;
  const subject = `Join Gloss Boss ATX — ${role}`;
  const html = `
    <div style="font-family:Arial,sans-serif;background:#050505;color:#fff;padding:24px;border:1px solid #d4af37;border-radius:14px;max-width:520px">
      <p style="margin:0 0 8px;color:#d4af37;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.16em">Gloss Boss ATX</p>
      <h2 style="margin:0 0 14px;font-size:22px">You're invited to the team</h2>
      <p style="margin:0 0 10px"><strong>${inviterName}</strong> invited you as <strong>${role}</strong>.</p>
      <p style="margin:0 0 16px;color:#aaa;font-size:14px">This secure link expires in ${INVITE_TTL_DAYS} days.</p>
      <a href="${link}" style="display:inline-block;background:#d4af37;color:#000;padding:12px 20px;border-radius:10px;font-weight:800;text-decoration:none">Set up your account</a>
      <p style="margin:16px 0 0;color:#666;font-size:12px">Questions? glossbossatx1@gmail.com</p>
    </div>
  `;

  let emailStatus = 'skipped';
  let smsStatus = 'skipped';
  let emailError: string | undefined;
  let smsError: string | undefined;

  if ((channel === 'email' || channel === 'both') && invite.email?.includes('@')) {
    if (resendConfigured()) {
      const sent = await sendResendHtml({ to: invite.email, subject, html });
      emailStatus = sent.ok ? 'sent' : 'failed';
      if (!sent.ok) emailError = sent.error ?? 'Email send failed';
      await logNotificationOutbox({
        kind: 'staff_invite',
        channel: 'email',
        status: sent.ok ? 'sent' : 'failed',
        provider: 'resend',
        recipient: invite.email,
        template_key: 'staff_invite',
        error_message: sent.error ?? null,
        payload: { invite_id: invite.id, role },
      });
    } else {
      emailStatus = 'not_configured';
    }
  }

  if ((channel === 'sms' || channel === 'both') && invite.phone) {
    const sms = await sendCustomerSms({
      db: admin,
      kind: 'staff_invite',
      template_key: 'staff_invite',
      to: invite.phone,
      body: smsBody,
      requireConsent: false,
    });
    smsStatus = sms.ok ? 'sent' : 'failed';
    if (!sms.ok) smsError = sms.error ?? 'SMS send failed';
  }

  await admin
    .from('staff_invites')
    .update({
      last_sent_at: new Date().toISOString(),
      last_sent_channel: channel,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  await logTitanActivity(admin, {
    kind: 'staff_invite_sent',
    title: `Staff invite sent to ${invite.fullName}`,
    detail: `${role} · ${channel} · email:${emailStatus} sms:${smsStatus}`,
    href: '/admin/team',
  });

  const ownerTo = businessNotifyDestination();
  if (resendConfigured() && ownerTo) {
    await sendResendHtml({
      to: ownerTo,
      subject: `Gloss Boss ATX — Staff invite sent to ${invite.fullName}`,
      html: `<p>Invite sent to <strong>${invite.fullName}</strong> (${role}) via ${channel}.</p>`,
    });
  }

  return { emailStatus, smsStatus, emailError, smsError };
}

export function portalPathForStaffRole(role: StaffInviteRole): string {
  if (role === 'technician') return '/tech';
  if (role === 'super_admin') return '/admin/super';
  return '/admin';
}

export async function regenerateInviteToken(
  admin: SupabaseClient,
  inviteId: string,
): Promise<{ ok: boolean; token?: string; invite?: StaffInviteRow; error?: string }> {
  const token = generateInviteToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
  const { data, error } = await admin
    .from('staff_invites')
    .update({
      token_hash: hashInviteToken(token),
      expires_at: expiresAt.toISOString(),
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', inviteId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not refresh invite token.' };
  return { ok: true, token, invite: mapInvite(data as Record<string, unknown>) };
}

export async function acceptStaffInvite(
  admin: SupabaseClient,
  token: string,
  input: {
    mode: 'create' | 'link';
    authUserId?: string;
    fullName: string;
    email: string;
    phone?: string;
    password?: string;
  },
): Promise<{ ok: boolean; redirect?: string; authUserId?: string; error?: string }> {
  const validated = await validateStaffInviteToken(admin, token);
  if (!validated.ok || !validated.invite) return { ok: false, error: validated.error };

  const invite = validated.invite;
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim() || invite.fullName;
  const phone = input.phone?.trim() || invite.phone || null;
  const now = new Date().toISOString();
  let userId = input.authUserId ?? null;

  if (input.mode === 'create') {
    if (!input.password || input.password.length < 8) {
      return { ok: false, error: 'Password must be at least 8 characters.' };
    }
    const created = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      phone: phone ?? undefined,
      user_metadata: { full_name: fullName, staff_onboarded: false },
    });
    if (created.error || !created.data.user?.id) {
      const em = created.error?.message ?? 'Could not create account.';
      if (/already|registered|exists|duplicate/i.test(em)) {
        return { ok: false, error: 'An account with this email already exists. Use “Sign in & link” instead.' };
      }
      return { ok: false, error: em };
    }
    userId = created.data.user.id;
  } else {
    if (!userId) return { ok: false, error: 'Sign in required to link your account.' };
  }

  const profilePayload: Record<string, unknown> = {
    id: userId,
    full_name: fullName,
    display_name: fullName,
    role: invite.role,
    email,
    phone,
    active: true,
    updated_at: now,
  };
  let profileUp = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' });
  if (profileUp.error) {
    profileUp = await admin.from('profiles').upsert(
      { id: userId, full_name: fullName, role: invite.role, email },
      { onConflict: 'id' },
    );
  }
  if (profileUp.error) return { ok: false, error: `Profile save failed: ${profileUp.error.message}` };

  await admin
    .from('staff_invites')
    .update({
      status: 'accepted',
      accepted_at: now,
      auth_user_id: userId,
      full_name: fullName,
      email,
      phone,
      updated_at: now,
    })
    .eq('id', invite.id);

  await logTitanActivity(admin, {
    kind: 'staff_invite_accepted',
    title: `${fullName} joined as ${roleLabel(invite.role)}`,
    detail: input.mode === 'create' ? 'New account created' : 'Existing account linked',
    href: '/admin/team',
  });

  return { ok: true, authUserId: userId!, redirect: portalPathForStaffRole(invite.role) };
}
