import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireSuperAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { parseAppRole } from '@/lib/auth/role-resolution';
import { findPendingInviteByProfileEmail } from '@/lib/staff-invites';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export const runtime = 'nodejs';

const STAFF_ROLES = new Set(['technician', 'admin', 'super_admin', 'dispatcher', 'viewer']);

type Body =
  | { intent: 'create'; email: string; password: string; role: string; fullName?: string }
  | { intent: 'reset_password'; userId: string; password: string }
  | { intent: 'send_password_reset_link'; userId: string }
  | { intent: 'assign_role'; profileId: string; role: string }
  | { intent: 'display_name'; profileId: string; fullName: string }
  | { intent: 'set_staff_active'; profileId: string; active: boolean }
  | { intent: 'remove_from_roster'; profileId: string };

export async function POST(request: Request) {
  const gate = await requireSuperAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Server admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 });
  }

  if (body.intent === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').trim();
    const role = String(body.role ?? '').trim();
    const fullNameRaw = String(body.fullName ?? '').trim();
    if (!email || !password || !STAFF_ROLES.has(role)) {
      return NextResponse.json({ ok: false, error: 'Valid email, password, and role are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const displayName = fullNameRaw || email.split('@')[0] || 'Staff';
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });

    let userId: string | null = created.data?.user?.id ?? null;
    let usedInvite = false;

    if (created.error || !userId) {
      const em = created.error?.message ?? '';
      if (/already|registered|exists|duplicate/i.test(em)) {
        return NextResponse.json({ ok: false, error: 'An account with this email already exists.' }, { status: 400 });
      }
      const invited = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: displayName },
      });
      if (invited.error || !invited.data?.user?.id) {
        return NextResponse.json(
          {
            ok: false,
            error: `${em || 'createUser failed'} — invite fallback failed: ${invited.error?.message ?? 'unknown'}`,
          },
          { status: 400 },
        );
      }
      userId = invited.data.user.id;
      usedInvite = true;
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      id: userId,
      full_name: displayName,
      display_name: displayName,
      role,
      email,
      updated_at: now,
      active: true,
    };
    let up = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
    if (up.error && /active|updated_at|email|display_name|column .* does not exist|Could not find|schema cache/i.test(up.error.message ?? '')) {
      up = await admin.from('profiles').upsert({ id: userId, full_name: displayName, role, email }, { onConflict: 'id' });
    }
    if (up.error) {
      return NextResponse.json({ ok: false, error: `User created but profile save failed: ${up.error.message}` }, { status: 400 });
    }
    revalidatePath('/admin/team');
    revalidatePath('/admin/super');
    return NextResponse.json({ ok: true, usedInvite });
  }

  if (body.intent === 'reset_password') {
    const userId = String(body.userId ?? '').trim();
    const password = String(body.password ?? '').trim();
    if (!userId || password.length < 8) {
      return NextResponse.json({ ok: false, error: 'Valid user id and password (min 8 characters) required.' }, { status: 400 });
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'send_password_reset_link') {
    const userId = String(body.userId ?? '').trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'User id required.' }, { status: 400 });
    }
    const { data: profile } = await admin.from('profiles').select('email, full_name, phone').eq('id', userId).maybeSingle();
    const email = String((profile as { email?: string } | null)?.email ?? '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: 'No email on staff profile.' }, { status: 400 });
    }

    const pendingInvite = await findPendingInviteByProfileEmail(admin, email);
    if (pendingInvite) {
      return NextResponse.json(
        {
          ok: false,
          invitePending: true,
          inviteId: pendingInvite.id,
          error: 'Invite pending — this person has not finished setup. Resend the team invite instead of a password reset.',
        },
        { status: 400 },
      );
    }
    const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://glossbossatx.com').replace(/\/$/, '');
    const redirectTo = `${appBase}/reset-password`;
    const linkRes = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
    if (linkRes.error || !linkRes.data?.properties?.action_link) {
      return NextResponse.json({ ok: false, error: linkRes.error?.message ?? 'Could not generate reset link.' }, { status: 400 });
    }
    const resetUrl = String(linkRes.data.properties.action_link);
    const displayName = String((profile as { full_name?: string } | null)?.full_name ?? email.split('@')[0] ?? 'Team member');
    const phone = String((profile as { phone?: string } | null)?.phone ?? '').trim();

    let emailStatus = 'skipped';
    let smsStatus = 'skipped';
    let emailError: string | null = null;
    let smsError: string | null = null;

    try {
      const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
      if (resendConfigured()) {
        const sent = await sendResendHtml({
          to: email,
          subject: 'Gloss Boss ATX — Reset your password',
          html: `<p>Hi ${displayName},</p><p>Reset your Gloss Boss ATX password here:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, contact the owner.</p>`,
        });
        emailStatus = sent.ok ? 'sent' : 'failed';
        emailError = sent.error ?? null;
      }
    } catch (e) {
      emailStatus = 'failed';
      emailError = e instanceof Error ? e.message : String(e);
    }

    if (phone) {
      try {
        const { twilioConfigured } = await import('@/lib/email-send');
        const { sendCustomerSms } = await import('@/lib/sms-send');
        if (twilioConfigured()) {
          const sms = await sendCustomerSms({
            db: admin,
            kind: 'password_reset',
            template_key: 'password_reset',
            to: phone,
            body: `Gloss Boss ATX: Password reset requested for your account. Set a new password here: ${resetUrl}`,
            requireConsent: false,
            extraPayload: { staff_user_id: userId, reset_url: resetUrl },
          });
          smsStatus = sms.ok ? 'sent' : sms.skipped ? 'skipped' : 'failed';
          smsError = sms.error ?? null;
        }
      } catch (e) {
        smsStatus = 'failed';
        smsError = e instanceof Error ? e.message : String(e);
      }
    }

    try {
      const { insertTitanNotificationEvent } = await import('@/lib/titan/notification-events');
      await insertTitanNotificationEvent(admin, {
        title: `Password reset sent: ${displayName}`,
        body: `Gloss Boss ATX: Reset email ${emailStatus}${emailError ? ` (${emailError})` : ''}. SMS ${smsStatus}${smsError ? ` (${smsError})` : ''}.`,
        source: 'auth',
        relatedType: 'profile',
        relatedId: userId,
        relatedUrl: '/admin/team',
        emailStatus,
        smsStatus,
      });
    } catch {
      /* non-blocking */
    }

    await logTitanActivity(admin, {
      kind: 'staff_reset_link_sent',
      title: `Password reset sent: ${displayName}`,
      detail: `email:${emailStatus} sms:${smsStatus}`,
      href: '/admin/team',
    });

    revalidatePath('/admin/team');
    return NextResponse.json({
      ok: true,
      emailStatus,
      smsStatus,
      emailError,
      smsError,
      resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined,
    });
  }

  if (body.intent === 'assign_role') {
    const targetId = String(body.profileId ?? '').trim();
    const nextRole = parseAppRole(String(body.role ?? '').trim());
    if (!targetId || !nextRole) {
      return NextResponse.json({ ok: false, error: 'Invalid role or profile id' }, { status: 400 });
    }
    if (targetId === gate.userId && nextRole !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'You cannot demote your own super_admin account from this panel.' }, { status: 400 });
    }
    const { data: before } = await admin.from('profiles').select('role, full_name').eq('id', targetId).maybeSingle();
    const now = new Date().toISOString();
    let { error } = await admin.from('profiles').update({ role: nextRole, updated_at: now }).eq('id', targetId);
    if (error && /updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const r2 = await admin.from('profiles').update({ role: nextRole }).eq('id', targetId);
      error = r2.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const prevRole = String((before as { role?: string } | null)?.role ?? '');
    const name = String((before as { full_name?: string } | null)?.full_name ?? 'Staff');
    await logTitanActivity(admin, {
      kind: 'staff_role_changed',
      title: `Role changed: ${name}`,
      detail: `${prevRole || 'unknown'} → ${nextRole}`,
      href: '/admin/team',
    });
    revalidatePath('/admin/super');
    revalidatePath('/admin/team');
    revalidatePath('/');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'display_name') {
    const profileId = String(body.profileId ?? '').trim();
    const fullName = String(body.fullName ?? '').trim();
    if (!profileId || !fullName) {
      return NextResponse.json({ ok: false, error: 'Profile id and display name required.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    let { error } = await admin.from('profiles').update({ full_name: fullName, display_name: fullName, updated_at: now }).eq('id', profileId);
    if (error && /display_name|updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const r2 = await admin.from('profiles').update({ full_name: fullName }).eq('id', profileId);
      error = r2.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'set_staff_active') {
    const profileId = String(body.profileId ?? '').trim();
    const active = Boolean(body.active);
    if (!profileId) {
      return NextResponse.json({ ok: false, error: 'Profile id required.' }, { status: 400 });
    }
    if (profileId === gate.userId && !active) {
      return NextResponse.json({ ok: false, error: 'You cannot deactivate your own account.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    let { error } = await admin.from('profiles').update({ active, updated_at: now }).eq('id', profileId);
    if (error && /active|updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const r2 = await admin.from('profiles').update({ active }).eq('id', profileId);
      error = r2.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/team');
    revalidatePath('/admin/dispatch');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'remove_from_roster') {
    const profileId = String(body.profileId ?? '').trim();
    if (!profileId) {
      return NextResponse.json({ ok: false, error: 'Profile id required.' }, { status: 400 });
    }
    if (profileId === gate.userId) {
      return NextResponse.json({ ok: false, error: 'You cannot remove your own profile.' }, { status: 400 });
    }
    const now = new Date().toISOString();
    let { error } = await admin
      .from('profiles')
      .update({ role: 'customer', active: false, updated_at: now })
      .eq('id', profileId);
    if (error && /active|updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const r2 = await admin.from('profiles').update({ role: 'customer' }).eq('id', profileId);
      error = r2.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    revalidatePath('/admin/team');
    revalidatePath('/admin/dispatch');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unknown intent' }, { status: 400 });
}
