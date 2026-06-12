'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { Settings, X, Shield, User, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

async function teamApi(body: object): Promise<{ ok: boolean; error?: string; usedInvite?: boolean }> {
  const res = await fetchWithTimeout('/api/admin/team', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
    timeoutMs: 120000,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; usedInvite?: boolean };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error ?? `Request failed (${res.status})` };
  }
  return { ok: true, usedInvite: data.usedInvite };
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
}: {
  profileId: string;
  initialRole: string;
  initialDisplayName: string;
  initialActive: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [name, setName] = useState(initialDisplayName);
  const [active, setActive] = useState(initialActive);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState<'role' | 'name' | 'pwd' | 'active' | 'remove' | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setRole(initialRole);
    setName(initialDisplayName);
    setActive(initialActive);
  }, [initialRole, initialDisplayName, initialActive]);

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
                      <option value="admin">admin</option>
                      <option value="super_admin">super_admin</option>
                      <option value="customer">customer</option>
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

                {/* 3. Password Reset */}
                <div className="space-y-2 bg-black/30 border border-white/5 p-4 rounded-2xl">
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
                      disabled={busy !== null}
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
