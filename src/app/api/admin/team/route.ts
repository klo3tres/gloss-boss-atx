import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { parseAppRole } from '@/lib/auth/role-resolution';
import { canAssignRole, canModifyStaffProfile, isProtectedOwner } from '@/lib/auth/owner-config';
import { repairStaffProfileFromSources } from '@/lib/auth/staff-profile-resolve';
import { findPendingInviteByProfileEmail } from '@/lib/staff-invites';
import { logTitanActivity } from '@/lib/titan/activity-feed';
import { passwordResetRedirectUrl } from '@/lib/auth/action-link-registry';
import { logAuthEvent } from '@/lib/auth/auth-event-log';
import type { AppRole } from '@/lib/auth/roles';

export const runtime = 'nodejs';

const STAFF_ROLES = new Set(['technician', 'admin', 'super_admin', 'dispatcher', 'viewer']);

type Body =
  | { intent: 'create'; email: string; password: string; role: string; fullName?: string }
  | { intent: 'reset_password'; userId: string; password: string }
  | { intent: 'send_password_reset_link'; userId: string }
  | { intent: 'assign_role'; profileId: string; role: string }
  | { intent: 'display_name'; profileId: string; fullName: string }
  | { intent: 'contact_details'; profileId: string; email: string; phone: string }
  | { intent: 'set_staff_active'; profileId: string; active: boolean }
  | { intent: 'remove_from_roster'; profileId: string }
  | { intent: 'repair_staff_profile'; profileId: string }
  | { intent: 'verify_staff_account'; profileId: string }
  | { intent: 'create_auth_for_staff'; profileId: string };

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
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
    if (gate.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'Only the owner can create accounts directly. Use Staff Invite instead.' }, { status: 403 });
    }
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
    const [{ data: profile }, { data: authUser }] = await Promise.all([
      admin.from('profiles').select('email, full_name, phone').eq('id', userId).maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);
    const email = String(
      (profile as { email?: string } | null)?.email ?? authUser?.user?.email ?? '',
    ).trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: 'No email is saved on this staff account. Add one under Contact details.' }, { status: 400 });
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
    const redirectTo = passwordResetRedirectUrl();
    const linkRes = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
    if (linkRes.error || !linkRes.data?.properties?.action_link) {
      await logAuthEvent(admin, {
        eventType: 'reset_requested',
        actorUserId: gate.userId,
        subjectUserId: userId,
        subjectEmail: email,
        detail: linkRes.error?.message ?? 'generateLink failed',
      });
      return NextResponse.json({ ok: false, error: linkRes.error?.message ?? 'Could not generate reset link.' }, { status: 400 });
    }
    let resetUrl = String(linkRes.data.properties.action_link);
    // Force production callback destination if Supabase omitted redirect_to
    try {
      const u = new URL(resetUrl);
      if (!u.searchParams.get('redirect_to')) {
        u.searchParams.set('redirect_to', redirectTo);
        resetUrl = u.toString();
      }
    } catch {
      /* keep original */
    }
    await logAuthEvent(admin, {
      eventType: 'reset_sent',
      actorUserId: gate.userId,
      subjectUserId: userId,
      subjectEmail: email,
      detail: 'Admin generated password reset link',
      meta: { redirectTo },
    });
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
          smsError = sms.error ?? (sms.skipped_reason ? String(sms.skipped_reason) : null);
        } else {
          smsStatus = 'skipped';
          smsError = 'SMS skipped — Twilio is not configured.';
        }
      } catch (e) {
        smsStatus = 'failed';
        smsError = e instanceof Error ? e.message : String(e);
      }
    } else {
      smsStatus = 'skipped';
      smsError = 'SMS skipped — missing phone number.';
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
    const { data: targetProfile } = await admin.from('profiles').select('role, full_name, email').eq('id', targetId).maybeSingle();
    const targetEmail = String((targetProfile as { email?: string } | null)?.email ?? '');
    const targetProtected = isProtectedOwner(targetEmail, targetId);

    if (!canModifyStaffProfile(gate.role, gate.userId, targetId, targetEmail)) {
      return NextResponse.json({ ok: false, error: 'You cannot modify this protected account.' }, { status: 403 });
    }
    if (!canAssignRole(gate.role, nextRole, targetProtected)) {
      return NextResponse.json({ ok: false, error: 'You cannot assign that role.' }, { status: 403 });
    }
    if (targetId === gate.userId && gate.role === 'super_admin' && nextRole !== 'super_admin') {
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

  if (body.intent === 'contact_details') {
    const profileId = String(body.profileId ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const phone = String(body.phone ?? '').trim();
    if (!profileId || !email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ ok: false, error: 'A valid email address is required.' }, { status: 400 });
    }
    const { data: targetProfile } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle();
    const currentEmail = String((targetProfile as { email?: string } | null)?.email ?? '');
    if (!canModifyStaffProfile(gate.role, gate.userId, profileId, currentEmail)) {
      return NextResponse.json({ ok: false, error: 'You cannot modify this protected account.' }, { status: 403 });
    }

    const authUpdate = await admin.auth.admin.updateUserById(profileId, {
      email,
      email_confirm: true,
      phone: phone || undefined,
      phone_confirm: Boolean(phone),
    });
    if (authUpdate.error) {
      return NextResponse.json({ ok: false, error: authUpdate.error.message }, { status: 400 });
    }

    const now = new Date().toISOString();
    let { error } = await admin.from('profiles').update({ email, phone: phone || null, updated_at: now }).eq('id', profileId);
    if (error && /updated_at|column .* does not exist|schema cache/i.test(error.message)) {
      const fallback = await admin.from('profiles').update({ email, phone: phone || null }).eq('id', profileId);
      error = fallback.error;
    }
    if (error) {
      return NextResponse.json({ ok: false, error: `Login contact updated, but profile sync failed: ${error.message}` }, { status: 400 });
    }
    await logAuthEvent(admin, {
      eventType: 'auth_email_changed',
      actorUserId: gate.userId,
      subjectUserId: profileId,
      subjectEmail: email,
      detail: currentEmail && currentEmail.toLowerCase() !== email ? `from ${currentEmail}` : 'unchanged-or-same',
      meta: { phoneUpdated: Boolean(phone) },
    });
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true, email, phone, authEmailAligned: true });
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
    const { data: targetProfile } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle();
    const targetEmail = String((targetProfile as { email?: string } | null)?.email ?? '');
    if (isProtectedOwner(targetEmail, profileId) && !active) {
      return NextResponse.json({ ok: false, error: 'The protected owner account cannot be deactivated.' }, { status: 403 });
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
    const { data: targetProfile } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle();
    const targetEmail = String((targetProfile as { email?: string } | null)?.email ?? '');
    if (isProtectedOwner(targetEmail, profileId)) {
      return NextResponse.json({ ok: false, error: 'The protected owner account cannot be removed from the roster.' }, { status: 403 });
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

  if (body.intent === 'repair_staff_profile') {
    const profileId = String(body.profileId ?? '').trim();
    if (!profileId) {
      return NextResponse.json({ ok: false, error: 'Profile id required.' }, { status: 400 });
    }
    const { data: targetProfile } = await admin.from('profiles').select('email').eq('id', profileId).maybeSingle();
    const targetEmail = String((targetProfile as { email?: string } | null)?.email ?? '');
    if (!canModifyStaffProfile(gate.role, gate.userId, profileId, targetEmail)) {
      return NextResponse.json({ ok: false, error: 'You cannot repair this account.' }, { status: 403 });
    }
    const repaired = await repairStaffProfileFromSources(admin, profileId);
    if (!repaired.ok) {
      return NextResponse.json({ ok: false, error: repaired.error ?? 'Repair failed.' }, { status: 400 });
    }
    await logTitanActivity(admin, {
      kind: 'staff_profile_repaired',
      title: 'Staff account repaired',
      detail: repaired.fixed.join(', '),
      href: '/admin/team',
    });
    revalidatePath('/admin/team');
    const { data: authUser } = await admin.auth.admin.getUserById(profileId);
    const { data: profile } = await admin.from('profiles').select('id, role, email, active').eq('id', profileId).maybeSingle();
    const email = String((profile as { email?: string } | null)?.email ?? '');
    const { data: invite } = email
      ? await admin
          .from('staff_invites')
          .select('status, role')
          .ilike('email', email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };
    return NextResponse.json({
      ok: true,
      fixed: repaired.fixed,
      role: repaired.role,
      auth: { exists: Boolean(authUser?.user), userId: authUser?.user?.id ?? null },
      profile: {
        exists: Boolean(profile),
        role: (profile as { role?: string } | null)?.role ?? null,
        active: (profile as { active?: boolean } | null)?.active !== false,
        email,
      },
      invite: {
        status: (invite as { status?: string } | null)?.status ?? null,
        role: (invite as { role?: string } | null)?.role ?? null,
      },
      delivery: null,
    });
  }

  if (body.intent === 'verify_staff_account') {
    const profileId = String(body.profileId ?? '').trim();
    if (!profileId) {
      return NextResponse.json({ ok: false, error: 'Profile id required.' }, { status: 400 });
    }
    const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(profileId);
    const { data: profile } = await admin.from('profiles').select('id, role, email, active, full_name').eq('id', profileId).maybeSingle();
    const email = String((profile as { email?: string } | null)?.email ?? authUser?.user?.email ?? '');
    const { data: invite } = await admin
      .from('staff_invites')
      .select('status, role, expires_at, last_sent_at')
      .ilike('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const authExists = Boolean(authUser?.user && !authErr);
    return NextResponse.json({
      ok: true,
      authUserExists: authExists,
      profileExists: Boolean(profile),
      profileRole: (profile as { role?: string } | null)?.role ?? null,
      profileActive: (profile as { active?: boolean } | null)?.active !== false,
      inviteStatus: (invite as { status?: string } | null)?.status ?? null,
      inviteRole: (invite as { role?: string } | null)?.role ?? null,
      email,
      auth: { exists: authExists, userId: authUser?.user?.id ?? null },
      profile: {
        exists: Boolean(profile),
        role: (profile as { role?: string } | null)?.role ?? null,
        active: (profile as { active?: boolean } | null)?.active !== false,
        email,
      },
      invite: {
        status: (invite as { status?: string } | null)?.status ?? null,
        role: (invite as { role?: string } | null)?.role ?? null,
      },
      delivery: null,
    });
  }

  if (body.intent === 'create_auth_for_staff') {
    const profileId = String(body.profileId ?? '').trim();
    if (!profileId) {
      return NextResponse.json({ ok: false, error: 'Profile id required.' }, { status: 400 });
    }
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role, email, phone, full_name, display_name, active')
      .eq('id', profileId)
      .maybeSingle();
    if (!profile) {
      return NextResponse.json({ ok: false, error: 'Staff profile not found.' }, { status: 404 });
    }
    const email = String((profile as { email?: string }).email ?? '').trim().toLowerCase();
    const fullName = String(
      (profile as { display_name?: string; full_name?: string }).display_name ||
        (profile as { full_name?: string }).full_name ||
        email.split('@')[0] ||
        'Staff',
    ).trim();
    const phone = String((profile as { phone?: string }).phone ?? '').trim();
    const role = String((profile as { role?: string }).role ?? 'technician');
    if (!canModifyStaffProfile(gate.role, gate.userId, profileId, email)) {
      return NextResponse.json({ ok: false, error: 'You cannot create auth for this account.' }, { status: 403 });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { ok: false, error: 'Add a valid email under Contact details before creating a login.' },
        { status: 400 },
      );
    }

    const existingAuth = await admin.auth.admin.getUserById(profileId);
    if (existingAuth.data?.user && !existingAuth.error) {
      return NextResponse.json({
        ok: true,
        alreadyExisted: true,
        auth: { exists: true, userId: profileId },
        profile: { exists: true, role, active: (profile as { active?: boolean }).active !== false, email },
        invite: null,
        delivery: { emailStatus: 'skipped', smsStatus: 'skipped', note: 'Auth user already exists.' },
      });
    }

    const tempPassword = `Gb${Math.random().toString(36).slice(2, 10)}!${Date.now().toString(36).slice(-4)}`;
    let userId: string | null = null;
    let usedInvite = false;
    let delivery: { emailStatus: string; smsStatus: string; emailError?: string | null; smsError?: string | null; note?: string } = {
      emailStatus: 'skipped',
      smsStatus: 'skipped',
    };

    const created = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      phone: phone || undefined,
      user_metadata: { full_name: fullName },
    });

    if (created.data?.user?.id && !created.error) {
      userId = created.data.user.id;
    } else {
      const em = created.error?.message ?? '';
      if (/already|registered|exists|duplicate/i.test(em)) {
        const invited = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
        });
        if (invited.error || !invited.data?.user?.id) {
          // Try listing by email
          const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
          const match = listed.data?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
          if (!match?.id) {
            return NextResponse.json(
              { ok: false, error: `Auth create failed: ${em || invited.error?.message || 'unknown'}` },
              { status: 400 },
            );
          }
          userId = match.id;
          usedInvite = false;
          delivery.note = 'Linked existing auth user by email.';
        } else {
          userId = invited.data.user.id;
          usedInvite = true;
          delivery.emailStatus = 'sent';
          delivery.note = 'Invite email sent via Supabase.';
        }
      } else {
        const invited = await admin.auth.admin.inviteUserByEmail(email, {
          data: { full_name: fullName },
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
        delivery.emailStatus = 'sent';
        delivery.note = 'Invite email sent via Supabase.';
      }
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Could not create or locate auth user.' }, { status: 400 });
    }

    // If auth id differs from orphan profile id, upsert profile onto auth id and deactivate orphan.
    if (userId !== profileId) {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = {
        id: userId,
        full_name: fullName,
        display_name: fullName,
        role,
        email,
        phone: phone || null,
        active: true,
        updated_at: now,
      };
      let up = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
      if (up.error) {
        up = await admin.from('profiles').upsert({ id: userId, full_name: fullName, role, email }, { onConflict: 'id' });
      }
      if (up.error) {
        return NextResponse.json({ ok: false, error: `Auth created but profile sync failed: ${up.error.message}` }, { status: 400 });
      }
      await admin.from('profiles').update({ active: false, updated_at: now }).eq('id', profileId);
    } else {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    }

    await logAuthEvent(admin, {
      eventType: 'staff_auth_created',
      actorUserId: gate.userId,
      subjectUserId: userId,
      subjectEmail: email,
      detail: usedInvite ? 'inviteUserByEmail' : 'createUser',
    });
    await logTitanActivity(admin, {
      kind: 'staff_auth_created',
      title: `Login created: ${fullName}`,
      detail: usedInvite ? 'Supabase invite sent' : 'Auth user created with confirmed email',
      href: '/admin/team',
    });

    revalidatePath('/admin/team');
    return NextResponse.json({
      ok: true,
      usedInvite,
      authUserId: userId,
      auth: { exists: true, userId },
      profile: { exists: true, role, active: true, email },
      invite: null,
      delivery,
    });
  }

  return NextResponse.json({ ok: false, error: 'Unknown intent' }, { status: 400 });
}
