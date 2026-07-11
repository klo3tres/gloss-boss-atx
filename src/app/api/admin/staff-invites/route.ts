import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import {
  createStaffInvite,
  inviteLinkForToken,
  listStaffInvites,
  regenerateInviteToken,
  sendStaffInviteNotification,
  type StaffInviteRole,
} from '@/lib/staff-invites';
import { logTitanActivity } from '@/lib/titan/activity-feed';

export const runtime = 'nodejs';

type Body =
  | { intent: 'list' }
  | { intent: 'create'; fullName: string; email?: string; phone?: string; role: StaffInviteRole; channel: 'sms' | 'email' | 'both' }
  | { intent: 'resend'; inviteId: string; channel: 'sms' | 'email' | 'both' }
  | { intent: 'copy_link'; inviteId: string }
  | { intent: 'revoke'; inviteId: string }
  | { intent: 'update'; inviteId: string; email?: string; phone?: string; fullName?: string };

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!admin || !session.user) {
    return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.intent === 'list') {
    const invites = await listStaffInvites(admin);
    return NextResponse.json({ ok: true, invites });
  }

  if (body.intent === 'create') {
    const phone = body.phone?.trim() ?? '';
    const email = body.email?.trim() ?? '';
    if ((body.channel === 'sms' || body.channel === 'both') && !phone) {
      return NextResponse.json({ ok: false, error: 'Phone number is required to send an SMS invite.' }, { status: 400 });
    }
    if ((body.channel === 'email' || body.channel === 'both') && !email) {
      return NextResponse.json({ ok: false, error: 'Email address is required to send an email invite.' }, { status: 400 });
    }
    const created = await createStaffInvite(admin, {
      invitedBy: session.user.id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      role: body.role,
    });
    if (!created.ok || !created.invite || !created.token) {
      return NextResponse.json({ ok: false, error: created.error ?? 'Create failed' }, { status: 400 });
    }
    const inviterName = session.profile?.full_name ?? 'Your manager';
    const sent = await sendStaffInviteNotification(admin, created.invite, created.token, body.channel, inviterName);
    await logTitanActivity(admin, {
      kind: 'staff_invite_created',
      title: `Staff invite created: ${created.invite.fullName}`,
      detail: `${created.invite.role} · ${body.channel}`,
      href: '/admin/team',
    });
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true, invite: created.invite, sent, inviteLink: inviteLinkForToken(created.token) });
  }

  if (body.intent === 'resend') {
    const refreshed = await regenerateInviteToken(admin, body.inviteId);
    if (!refreshed.ok || !refreshed.invite || !refreshed.token) {
      return NextResponse.json({ ok: false, error: refreshed.error ?? 'Resend failed' }, { status: 400 });
    }
    if ((body.channel === 'sms' || body.channel === 'both') && !refreshed.invite.phone) {
      return NextResponse.json({ ok: false, error: 'Invite has no phone number — add a phone before sending SMS.' }, { status: 400 });
    }
    if ((body.channel === 'email' || body.channel === 'both') && !refreshed.invite.email) {
      return NextResponse.json({ ok: false, error: 'Invite has no email — add an email before sending email.' }, { status: 400 });
    }
    const inviterName = session.profile?.full_name ?? 'Your manager';
    const sent = await sendStaffInviteNotification(admin, refreshed.invite, refreshed.token, body.channel, inviterName);
    const link = inviteLinkForToken(refreshed.token);
    await logTitanActivity(admin, {
      kind: 'staff_invite_resent',
      title: `Staff invite resent: ${refreshed.invite.fullName}`,
      detail: body.channel,
      href: '/admin/team',
    });
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true, sent, inviteLink: link });
  }

  if (body.intent === 'revoke') {
    const { error } = await admin
      .from('staff_invites')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', body.inviteId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logTitanActivity(admin, {
      kind: 'staff_invite_revoked',
      title: 'Staff invite revoked',
      detail: body.inviteId,
      href: '/admin/team',
    });
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true });
  }

  if (body.intent === 'copy_link') {
    const refreshed = await regenerateInviteToken(admin, body.inviteId);
    if (!refreshed.ok || !refreshed.token) {
      return NextResponse.json({ ok: false, error: refreshed.error ?? 'Could not create invite link' }, { status: 400 });
    }
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true, inviteLink: inviteLinkForToken(refreshed.token) });
  }

  if (body.intent === 'update') {
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (body.email) patch.email = body.email.trim().toLowerCase();
    if (body.phone) patch.phone = body.phone.trim();
    if (body.fullName) patch.full_name = body.fullName.trim();
    const { error } = await admin.from('staff_invites').update(patch).eq('id', body.inviteId).eq('status', 'pending');
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    revalidatePath('/admin/team');
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: 'Unknown intent' }, { status: 400 });
}

export async function GET() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 });
  const invites = await listStaffInvites(admin);
  return NextResponse.json({ ok: true, invites });
}
