'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { Settings, X, Shield, User, Lock, Mail, Phone, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StaffInviteRow } from '@/lib/staff-invites';

async function teamApi(body: object): Promise<{
  ok: boolean;
  error?: string;
  usedInvite?: boolean;
  invitePending?: boolean;
  emailStatus?: string;
  smsStatus?: string;
  emailError?: string | null;
  smsError?: string | null;
  fixed?: string[];
  role?: string;
  authUserExists?: boolean;
  profileExists?: boolean;
  profileRole?: string | null;
  inviteStatus?: string | null;
  auth?: { exists?: boolean; userId?: string | null };
  profile?: { exists?: boolean; role?: string | null; active?: boolean; email?: string };
  invite?: { status?: string | null; role?: string | null } | null;
  delivery?: {
    emailStatus?: string;
    smsStatus?: string;
    emailError?: string | null;
    smsError?: string | null;
    note?: string;
  } | null;
  alreadyExisted?: boolean;
}> {
  const res = await fetchWithTimeout('/api/admin/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 120000,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !data.ok) {
    return {
      ok: false,
      error: (data.error as string) ?? `Request failed (${res.status})`,
      invitePending: Boolean(data.invitePending),
      emailStatus: data.emailStatus as string | undefined,
      smsStatus: data.smsStatus as string | undefined,
      emailError: (data.emailError as string | null) ?? null,
      smsError: (data.smsError as string | null) ?? null,
    };
  }
  return {
    ok: true,
    usedInvite: data.usedInvite as boolean | undefined,
    invitePending: data.invitePending as boolean | undefined,
    emailStatus: data.emailStatus as string | undefined,
    smsStatus: data.smsStatus as string | undefined,
    emailError: (data.emailError as string | null) ?? null,
    smsError: (data.smsError as string | null) ?? null,
    fixed: data.fixed as string[] | undefined,
    role: data.role as string | undefined,
    authUserExists: data.authUserExists as boolean | undefined,
    profileExists: data.profileExists as boolean | undefined,
    profileRole: (data.profileRole as string | null) ?? null,
    inviteStatus: (data.inviteStatus as string | null) ?? null,
    auth: data.auth as { exists?: boolean; userId?: string | null } | undefined,
    profile: data.profile as { exists?: boolean; role?: string | null; active?: boolean; email?: string } | undefined,
    invite: data.invite as { status?: string | null; role?: string | null } | null | undefined,
    delivery: data.delivery as {
      emailStatus?: string;
      smsStatus?: string;
      emailError?: string | null;
      smsError?: string | null;
      note?: string;
    } | null | undefined,
    alreadyExisted: data.alreadyExisted as boolean | undefined,
  };
}

async function inviteApi(body: object) {
  const res = await fetchWithTimeout('/api/admin/staff-invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 120000,
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    inviteLink?: string;
    sent?: { emailStatus?: string; smsStatus?: string; emailError?: string; smsError?: string };
  };
  if (!res.ok || !data.ok) return { ok: false as const, error: data.error ?? `Request failed (${res.status})` };
  return { ok: true as const, sent: data.sent, inviteLink: data.inviteLink };
}

export function StaffInviteClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const channel = String(fd.get('channel') ?? 'both') as 'sms' | 'email' | 'both';
        const email = String(fd.get('email') ?? '').trim();
        const phone = String(fd.get('phone') ?? '').trim();
        if (!email && !phone) {
          setMsg({ type: 'err', text: 'Enter email and/or phone for the invite.' });
          return;
        }
        void (async () => {
          setBusy(true);
          setMsg(null);
          const r = await inviteApi({
            intent: 'create',
            fullName: String(fd.get('fullName') ?? ''),
            email: email || undefined,
            phone: phone || undefined,
            role: String(fd.get('role') ?? 'technician'),
            channel,
          });
          setBusy(false);
          if (!r.ok) {
            setMsg({ type: 'err', text: r.error ?? 'Invite failed' });
            return;
          }
          const parts = [
            r.sent?.emailStatus === 'sent' ? 'email sent' : r.sent?.emailStatus ? `email ${r.sent.emailStatus}` : null,
            r.sent?.smsStatus === 'sent' ? 'SMS sent' : r.sent?.smsStatus ? `SMS ${r.sent.smsStatus}` : null,
          ].filter(Boolean);
          if (r.inviteLink) {
            try {
              await navigator.clipboard.writeText(r.inviteLink);
            } catch {
              /* ignore */
            }
          }
          setMsg({
            type: r.sent?.emailStatus === 'failed' && r.sent?.smsStatus !== 'sent' ? 'err' : 'ok',
            text: `Invite created · ${parts.join(' · ') || 'link ready'}${r.inviteLink ? ' · link copied' : ''}${r.sent?.emailError ? ` — ${r.sent.emailError}` : ''}${r.sent?.smsError ? ` — ${r.sent.smsError}` : ''}`,
          });
          e.currentTarget.reset();
          router.refresh();
        })();
      }}
    >
      <label className="block text-xs text-muted-foreground sm:col-span-2">
        Full name
        <input name="fullName" required className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
      </label>
      <label className="block text-xs text-muted-foreground">
        <Mail className="inline h-3 w-3" /> Email (optional if SMS)
        <input name="email" type="email" className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
      </label>
      <label className="block text-xs text-muted-foreground">
        <Phone className="inline h-3 w-3" /> Phone (optional if email)
        <input name="phone" type="tel" className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground" />
      </label>
      <label className="block text-xs text-muted-foreground">
        Role
        <select name="role" required className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground">
          <option value="technician">Technician</option>
          <option value="dispatcher">Dispatcher</option>
          <option value="admin">Admin</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      <label className="block text-xs text-muted-foreground">
        Send via
        <select name="channel" required className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground">
          <option value="both">SMS + email</option>
          <option value="sms">SMS only</option>
          <option value="email">Email only</option>
        </select>
      </label>
      <button type="submit" disabled={busy} className="sm:col-span-2 rounded-lg bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50">
        <Send className="inline h-3.5 w-3.5 mr-1" />
        {busy ? 'Sending…' : 'Send team invite'}
      </button>
      {msg ? (
        <p className={`sm:col-span-2 rounded-lg border p-3 text-sm ${msg.type === 'ok' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100' : 'border-rose-500/40 bg-rose-500/10 text-rose-100'}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}

export function PendingInvitesClient({ initialInvites }: { initialInvites: StaffInviteRow[] }) {
  const router = useRouter();
  const [invites, setInvites] = useState(initialInvites);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [resendChannel, setResendChannel] = useState<Record<string, 'sms' | 'email' | 'both'>>({});

  useEffect(() => setInvites(initialInvites), [initialInvites]);

  const pending = invites.filter((i) => i.status === 'pending');

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5 text-center">
        <p className="text-sm font-bold text-foreground">No pending invites</p>
        <p className="mt-1 text-xs text-muted-foreground">Use the invite form above to add technicians, dispatchers, or admins. Pending invites stay visible here until accepted.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {msg ? <p className="text-xs text-emerald-700">{msg}</p> : null}
      {pending.map((inv) => (
        <div key={inv.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-bold text-foreground">{inv.fullName}</p>
              <p className="text-xs text-muted-foreground">{inv.role.replace('_', ' ')} · {inv.email ?? '—'} · {inv.phone ?? '—'}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {inv.lastSentAt ? `Last sent ${new Date(inv.lastSentAt).toLocaleString()} (${inv.lastSentChannel})` : 'Not sent yet'}
                {' · '}Expires {new Date(inv.expiresAt).toLocaleDateString()}
              </p>
            </div>
            <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[8px] font-black uppercase text-amber-700">Pending</span>
          </div>

          {editingId === inv.id ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Email"
                className="rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
              />
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Phone"
                className="rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
              />
              <button
                type="button"
                disabled={busyId === inv.id}
                onClick={() => {
                  void (async () => {
                    setBusyId(inv.id);
                    const r = await inviteApi({
                      intent: 'update',
                      inviteId: inv.id,
                      email: editEmail.trim() || undefined,
                      phone: editPhone.trim() || undefined,
                    });
                    setBusyId(null);
                    if (!r.ok) {
                      setMsg(r.error ?? 'Update failed');
                      return;
                    }
                    setEditingId(null);
                    setMsg('Invite contact updated.');
                    router.refresh();
                  })();
                }}
                className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft sm:col-span-2"
              >
                Save contact
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={resendChannel[inv.id] ?? (inv.email && inv.phone ? 'both' : inv.phone ? 'sms' : 'email')}
              onChange={(e) => setResendChannel((prev) => ({ ...prev, [inv.id]: e.target.value as 'sms' | 'email' | 'both' }))}
              className="rounded-lg border border-border bg-input px-2 py-1.5 text-[10px] text-foreground"
            >
              <option value="both">SMS + email</option>
              <option value="sms">SMS only</option>
              <option value="email">Email only</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setEditingId(editingId === inv.id ? null : inv.id);
                setEditEmail(inv.email ?? '');
                setEditPhone(inv.phone ?? '');
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-black uppercase text-foreground"
            >
              Edit contact
            </button>
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => {
                void (async () => {
                  setBusyId(inv.id);
                  setMsg(null);
                  const channel = resendChannel[inv.id] ?? (inv.email && inv.phone ? 'both' : inv.phone ? 'sms' : 'email');
                  const r = await inviteApi({ intent: 'resend', inviteId: inv.id, channel });
                  setBusyId(null);
                  if (!r.ok) {
                    setMsg(r.error ?? 'Resend failed');
                    return;
                  }
                  if (r.inviteLink) {
                    try {
                      await navigator.clipboard.writeText(r.inviteLink);
                      setMsg('Invite resent and link copied to clipboard.');
                    } catch {
                      setMsg('Invite resent.');
                    }
                  } else {
                    setMsg('Invite resent.');
                  }
                  router.refresh();
                })();
              }}
              className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft"
            >
              Resend
            </button>
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => {
                void (async () => {
                  setBusyId(inv.id);
                  setMsg(null);
                  const r = await inviteApi({ intent: 'copy_link', inviteId: inv.id });
                  setBusyId(null);
                  if (!r.ok || !r.inviteLink) {
                    setMsg(r.error ?? 'Could not copy link');
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(r.inviteLink);
                    setMsg('Invite link copied.');
                  } catch {
                    setMsg(r.inviteLink);
                  }
                  window.open(r.inviteLink, '_blank', 'noopener,noreferrer');
                })();
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-[10px] font-black uppercase text-foreground"
            >
              Copy / open link
            </button>
            <button
              type="button"
              disabled={busyId === inv.id}
              onClick={() => {
                void (async () => {
                  setBusyId(inv.id);
                  await inviteApi({ intent: 'revoke', inviteId: inv.id });
                  setBusyId(null);
                  router.refresh();
                })();
              }}
              className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-rose-600"
            >
              Revoke
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CreateStaffClient() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className='mt-4 grid gap-3 sm:grid-cols-2'
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        void (async () => {
          setBusy(true);
          setMsg(null);
          const r = await teamApi({
            intent: 'create',
            email: String(fd.get('email') ?? ''),
            password: String(fd.get('password') ?? ''),
            role: String(fd.get('role') ?? ''),
            fullName: String(fd.get('fullName') ?? ''),
          });
          setBusy(false);
          if (!r.ok) {
            setMsg({ type: 'err', text: r.error ?? 'Failed' });
            return;
          }
          setMsg({
            type: 'ok',
            text: r.usedInvite
              ? 'Invitation sent. Teammate completes signup from email.'
              : 'Staff account created. Share the temporary password securely.',
          });
          e.currentTarget.reset();
          router.refresh();
        })();
      }}
    >
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Display name (shown in roster)
        <input
          name='fullName'
          type='text'
          required
          autoComplete='off'
          placeholder='Alex Detail'
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Work email
        <input
          name='email'
          type='email'
          required
          autoComplete='off'
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Temporary password <span className='text-amber-200'>(minimum 8 characters)</span>
        <input
          name='password'
          type='password'
          required
          minLength={8}
          autoComplete='new-password'
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Role
        <select name='role' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
          <option value='technician'>Technician</option>
          <option value='admin'>Admin</option>
          <option value='super_admin'>Super admin</option>
        </select>
      </label>
      <button
        type='submit'
        disabled={busy}
        className='sm:col-span-2 rounded-lg bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50'
      >
        {busy ? 'Working…' : 'Create staff account'}
      </button>
      {msg?.type === 'ok' ? (
        <p className='sm:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100' role='status'>
          {msg.text}
        </p>
      ) : null}
      {msg?.type === 'err' ? (
        <p className='sm:col-span-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100' role='alert'>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}

export function StaffRowSuperClient({
  profileId,
  initialRole,
  initialDisplayName,
  initialActive,
  currentUserId,
  profileEmail,
  profilePhone,
  pendingInviteId,
}: {
  profileId: string;
  initialRole: string;
  initialDisplayName: string;
  initialActive: boolean;
  currentUserId: string;
  profileEmail?: string | null;
  profilePhone?: string | null;
  pendingInviteId?: string | null;
}) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState(initialDisplayName);
  const [active, setActive] = useState(initialActive);
  const [email, setEmail] = useState(profileEmail ?? '');
  const [phone, setPhone] = useState(profilePhone ?? '');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState<'role' | 'name' | 'contact' | 'pwd' | 'pwd-link' | 'active' | 'remove' | 'verify' | 'repair' | 'create-auth' | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [authExists, setAuthExists] = useState<boolean | null>(null);

  useEffect(() => {
    setRole(initialRole);
    setName(initialDisplayName);
    setActive(initialActive);
    setEmail(profileEmail ?? '');
    setPhone(profilePhone ?? '');
  }, [initialRole, initialDisplayName, initialActive, profileEmail, profilePhone]);

  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      const r = await teamApi({ intent: 'verify_staff_account', profileId });
      if (r.ok) setAuthExists(r.auth?.exists ?? r.authUserExists ?? null);
    })();
  }, [isOpen, profileId]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          setIsOpen(true);
        }}
        className="rounded-xl border border-gold/25 bg-gold/10 hover:bg-gold/20 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gold-soft transition flex items-center gap-1.5"
      >
        <Settings className="h-3.5 w-3.5" /> Manage
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-50 bg-black"
            />

            {/* Slide-over Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)] text-left"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <User className="h-5 w-5 text-gold-soft" /> Edit Staff Member
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">ID: <span className="font-mono text-zinc-400">{profileId}</span></p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
                {/* 1. Display Name */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <User className="h-3.5 w-3.5" /> Display Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Display name"
                      className="flex-1 text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                    />
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy('name');
                          setMsg(null);
                          const r = await teamApi({ intent: 'display_name', profileId, fullName: name.trim() });
                          setBusy(null);
                          if (!r.ok) {
                            setMsg({ type: 'err', text: r.error ?? 'Could not save name' });
                            return;
                          }
                          setMsg({ type: 'ok', text: 'Display name saved.' });
                          router.refresh();
                        })();
                      }}
                      className="rounded-xl border border-white/20 px-3.5 py-2 text-[10px] font-black uppercase text-white hover:bg-white/5 disabled:opacity-40 transition"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Contact details used for login, password recovery, and dispatch alerts. */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Contact details</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="Email address"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    type="tel"
                    placeholder="Phone number"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                  />
                  <button
                    type="button"
                    disabled={busy !== null || !email.trim()}
                    onClick={() => {
                      void (async () => {
                        setBusy('contact');
                        setMsg(null);
                        const r = await teamApi({ intent: 'contact_details', profileId, email: email.trim(), phone: phone.trim() });
                        setBusy(null);
                        if (!r.ok) {
                          setMsg({ type: 'err', text: r.error ?? 'Could not save contact details' });
                          return;
                        }
                        setMsg({ type: 'ok', text: 'Email and phone saved.' });
                        router.refresh();
                      })();
                    }}
                    className="rounded-xl border border-gold/40 px-3.5 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/5 disabled:opacity-40 transition"
                  >
                    {busy === 'contact' ? 'Saving…' : 'Save contact details'}
                  </button>
                </div>

                {/* 2. Assign Role */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5" /> Security Role
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="flex-1 text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                    >
                      <option value="technician">technician</option>
                      <option value="dispatcher">dispatcher</option>
                      <option value="admin">admin</option>
                      <option value="viewer">viewer</option>
                    </select>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy('role');
                          setMsg(null);
                          const r = await teamApi({ intent: 'assign_role', profileId, role });
                          setBusy(null);
                          if (!r.ok) {
                            setMsg({ type: 'err', text: r.error ?? 'Role update failed' });
                            return;
                          }
                          setMsg({ type: 'ok', text: 'Role updated.' });
                          router.refresh();
                        })();
                      }}
                      className="rounded-xl border border-gold/40 px-3.5 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/5 disabled:opacity-40 transition"
                    >
                      Assign
                    </button>
                  </div>
                </div>

                <div className="space-y-2 rounded-2xl border border-white/5 bg-black/30 p-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Account repair</label>
                  <p className="text-xs text-zinc-500">Verify auth + profile linkage and repair staff role from accepted invites.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy('verify');
                          setMsg(null);
                          const r = await teamApi({ intent: 'verify_staff_account', profileId });
                          setBusy(null);
                          if (!r.ok) {
                            setMsg({ type: 'err', text: r.error ?? 'Verify failed' });
                            return;
                          }
                          setMsg({
                            type: 'ok',
                            text: `Auth: ${r.auth?.exists ?? r.authUserExists ? 'ok' : 'missing'} · Profile: ${r.profile?.exists ?? r.profileExists ? r.profile?.role ?? r.profileRole : 'missing'} · Invite: ${r.invite?.status ?? r.inviteStatus ?? 'none'}`,
                          });
                          setAuthExists(r.auth?.exists ?? r.authUserExists ?? null);
                        })();
                      }}
                      className="rounded-xl border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-zinc-300"
                    >
                      Verify account
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => {
                        void (async () => {
                          setBusy('repair');
                          setMsg(null);
                          const r = await teamApi({ intent: 'repair_staff_profile', profileId });
                          setBusy(null);
                          if (!r.ok) {
                            setMsg({ type: 'err', text: r.error ?? 'Repair failed' });
                            return;
                          }
                          setMsg({ type: 'ok', text: `Repaired: ${(r.fixed ?? []).join(', ') || 'no changes'}${r.auth ? ` · Auth ${r.auth.exists ? 'ok' : 'missing'}` : ''}` });
                          if (r.auth?.exists != null) setAuthExists(r.auth.exists);
                          router.refresh();
                        })();
                      }}
                      className="rounded-xl border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-300"
                    >
                      Repair profile/role
                    </button>
                  </div>
                </div>

                {/* 3. Password / invite */}
                <div className="space-y-2 bg-black/30 border border-white/5 p-4 rounded-2xl">
                  {pendingInviteId ? (
                    <>
                      <label className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <Lock className="h-3.5 w-3.5" /> Invite pending
                      </label>
                      <p className="text-xs text-zinc-400">
                        {profileEmail ? `${profileEmail} has not accepted the team invite yet.` : 'Team invite not accepted yet.'}
                        {' '}Use resend — not password reset.
                      </p>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          void (async () => {
                            setBusy('pwd-link');
                            setMsg(null);
                            const r = await inviteApi({ intent: 'resend', inviteId: pendingInviteId, channel: 'both' });
                            setBusy(null);
                            if (!r.ok) {
                              setMsg({ type: 'err', text: r.error ?? 'Could not resend invite' });
                              return;
                            }
                            const parts = [
                              r.sent?.emailStatus ? `email ${r.sent.emailStatus}` : null,
                              r.sent?.smsStatus ? `SMS ${r.sent.smsStatus}` : null,
                            ].filter(Boolean);
                            setMsg({
                              type: r.sent?.smsStatus === 'failed' && r.sent?.emailStatus !== 'sent' ? 'err' : 'ok',
                              text: `Invite resent${parts.length ? ` · ${parts.join(' · ')}` : ''}${r.sent?.emailError ? ` — ${r.sent.emailError}` : ''}${r.sent?.smsError ? ` — ${r.sent.smsError}` : ''}`,
                            });
                            router.refresh();
                          })();
                        }}
                        className="rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20 disabled:opacity-40 transition"
                      >
                        Resend team invite
                      </button>
                    </>
                  ) : authExists === false ? (
                    <>
                      <label className="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <Lock className="h-3.5 w-3.5" /> Login missing
                      </label>
                      <p className="text-xs text-zinc-400">
                        This roster row has no Supabase auth user. Create a login before sending a password reset.
                        {profileEmail ? ` Email on file: ${profileEmail}.` : ' Add an email under Contact details first.'}
                      </p>
                      <button
                        type="button"
                        disabled={busy !== null || !profileEmail}
                        onClick={() => {
                          void (async () => {
                            setBusy('create-auth');
                            setMsg(null);
                            const r = await teamApi({ intent: 'create_auth_for_staff', profileId });
                            setBusy(null);
                            if (!r.ok) {
                              setMsg({ type: 'err', text: r.error ?? 'Could not create account' });
                              return;
                            }
                            setAuthExists(true);
                            const d = r.delivery;
                            setMsg({
                              type: 'ok',
                              text: `Account created${r.alreadyExisted ? ' (already existed)' : ''}${d?.note ? ` · ${d.note}` : ''}${d?.emailStatus ? ` · email ${d.emailStatus}` : ''}${d?.smsError ? ` — ${d.smsError}` : ''}`,
                            });
                            router.refresh();
                          })();
                        }}
                        className="rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20 disabled:opacity-40 transition"
                      >
                        {busy === 'create-auth' ? 'Creating…' : 'Create account'}
                      </button>
                    </>
                  ) : (
                    <>
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> Reset Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                      type="password"
                      minLength={8}
                      placeholder="New temp password (8+ chars)"
                      autoComplete="new-password"
                      className="flex-1 text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                    />
                    <button
                      type="button"
                      disabled={busy !== null || authExists === null}
                      onClick={() => {
                        void (async () => {
                          setBusy('pwd-link');
                          setMsg(null);
                          const r = await teamApi({ intent: 'send_password_reset_link', userId: profileId });
                          setBusy(null);
                          if (!r.ok) {
                            const errText = (r as { invitePending?: boolean }).invitePending
                              ? (r.error ?? 'Invite pending — resend team invite instead.')
                              : (r.error ?? 'Could not send reset link');
                            setMsg({ type: 'err', text: errText });
                            return;
                          }
                          const parts = [
                            r.emailStatus === 'sent' ? 'email sent' : `email ${r.emailStatus}`,
                            r.smsStatus === 'sent' ? 'SMS sent' : r.smsStatus ? `SMS ${r.smsStatus}` : null,
                          ].filter(Boolean);
                          setMsg({
                            type: r.emailStatus === 'failed' && r.smsStatus !== 'sent' ? 'err' : 'ok',
                            text: `Reset link: ${parts.join(' · ')}${r.emailError ? ` — ${r.emailError}` : ''}${r.smsError ? ` — ${r.smsError}` : ''}`,
                          });
                        })();
                      }}
                      className="rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20 disabled:opacity-40 transition"
                    >
                      Send link
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null || authExists === null}
                      onClick={() => {
                        void (async () => {
                          if (pwd.length < 8) {
                            setMsg({ type: 'err', text: 'Password must be at least 8 characters.' });
                            return;
                          }
                          setBusy('pwd');
                          setMsg(null);
                          const r = await teamApi({ intent: 'reset_password', userId: profileId, password: pwd });
                          setBusy(null);
                          if (!r.ok) {
                            setMsg({ type: 'err', text: r.error ?? 'Reset failed' });
                            return;
                          }
                          setPwd('');
                          setMsg({ type: 'ok', text: 'Password reset.' });
                          router.refresh();
                        })();
                      }}
                      className="rounded-xl border border-white/20 px-3.5 py-2 text-[10px] font-black uppercase text-white hover:bg-white/5 disabled:opacity-40 transition"
                    >
                      Reset
                    </button>
                  </div>
                    </>
                  )}
                </div>

                {/* Inline status messages */}
                {msg && (
                  <p
                    className={`text-xs p-3 rounded-xl border ${
                      msg.type === 'ok'
                        ? 'border-emerald-500/35 bg-emerald-500/5 text-emerald-300'
                        : 'border-rose-500/35 bg-rose-500/5 text-rose-300'
                    }`}
                    role={msg.type === 'err' ? 'alert' : 'status'}
                  >
                    {msg.text}
                  </p>
                )}

                {/* 4. Active Status & Roster Removal */}
                {profileId !== currentUserId ? (
                  <div className="border-t border-white/5 pt-6 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Account Lifecycle</h4>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          void (async () => {
                            setBusy('active');
                            setMsg(null);
                            const next = !active;
                            const r = await teamApi({ intent: 'set_staff_active', profileId, active: next });
                            setBusy(null);
                            if (!r.ok) {
                              setMsg({ type: 'err', text: r.error ?? 'Update failed' });
                              return;
                            }
                            setActive(next);
                            setMsg({ type: 'ok', text: next ? 'Reactivated.' : 'Deactivated.' });
                            router.refresh();
                          })();
                        }}
                        className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold uppercase text-zinc-300 hover:bg-white/5 hover:text-white disabled:opacity-40 transition"
                      >
                        {active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          if (!window.confirm('Remove this profile from the staff roster? Sets role to customer and hides from dispatch. Auth login is unchanged.')) {
                            return;
                          }
                          void (async () => {
                            setBusy('remove');
                            setMsg(null);
                            const r = await teamApi({ intent: 'remove_from_roster', profileId });
                            setBusy(null);
                            if (!r.ok) {
                              setMsg({ type: 'err', text: r.error ?? 'Remove failed' });
                              return;
                            }
                            setMsg({ type: 'ok', text: 'Removed from roster.' });
                            router.refresh();
                          })();
                        }}
                        className="rounded-xl border border-rose-500/25 bg-rose-500/5 hover:bg-rose-500/10 px-4 py-3 text-xs font-bold uppercase text-rose-300 disabled:opacity-40 transition"
                      >
                        Remove Roster
                      </button>
                    </div>
                    
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      Deactivating a member hides them from the active dispatch scheduler. Removing roster demotes their profile to a standard customer record.
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-zinc-500 italic border-t border-white/5 pt-4">
                    This profile is currently logged in. Lifecycle controls are disabled.
                  </p>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="border-t border-white/10 pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white transition"
                >
                  Close Manager
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
