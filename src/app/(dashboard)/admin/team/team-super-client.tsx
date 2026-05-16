'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

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

  useEffect(() => {
    setRole(initialRole);
    setName(initialDisplayName);
    setActive(initialActive);
  }, [initialRole, initialDisplayName, initialActive]);

  return (
    <div className='flex min-w-[260px] flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-1'>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className='rounded border border-zinc-700 bg-black px-2 py-1 text-[11px] text-white'
        >
          <option value='technician'>technician</option>
          <option value='admin'>admin</option>
          <option value='super_admin'>super_admin</option>
          <option value='customer'>customer</option>
        </select>
        <button
          type='button'
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
          className='rounded border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft disabled:opacity-40'
        >
            Assign role
        </button>
      </div>
      <div className='flex flex-wrap items-center gap-1'>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Display name'
          className='min-w-0 flex-1 rounded border border-zinc-700 bg-black px-2 py-1 text-[11px] text-white'
        />
        <button
          type='button'
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
          className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200 disabled:opacity-40'
        >
          Save name
        </button>
      </div>
      <div className='flex flex-wrap items-center gap-1'>
        <input
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          type='password'
          minLength={8}
          placeholder='New temp password (8+ chars)'
          autoComplete='new-password'
          className='min-w-0 flex-1 rounded border border-zinc-700 bg-black px-2 py-1 text-[11px] text-white'
        />
        <button
          type='button'
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
              setMsg({ type: 'ok', text: 'Password reset. Share the new password securely.' });
              router.refresh();
            })();
          }}
          className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200 disabled:opacity-40'
        >
          Reset pwd
        </button>
      </div>
      {msg ? (
        <p
          className={`text-[10px] ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}
          role={msg.type === 'err' ? 'alert' : 'status'}
        >
          {msg.text}
        </p>
      ) : null}
      {profileId !== currentUserId ? (
        <div className='mt-2 flex flex-col gap-1 border-t border-white/10 pt-2'>
          <div className='flex flex-wrap gap-1'>
            <button
              type='button'
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
                  setMsg({ type: 'ok', text: next ? 'Reactivated.' : 'Deactivated (hidden from dispatch).' });
                  router.refresh();
                })();
              }}
              className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200 disabled:opacity-40'
            >
              {active ? 'Deactivate' : 'Reactivate'}
            </button>
            <button
              type='button'
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
              className='rounded border border-rose-500/40 px-2 py-1 text-[10px] font-bold uppercase text-rose-200 disabled:opacity-40'
            >
              Remove roster
            </button>
          </div>
          <p className='text-[9px] text-zinc-600'>Does not delete the Supabase auth user — profile only.</p>
        </div>
      ) : (
        <p className='mt-2 text-[9px] text-zinc-600'>This row is you — roster controls hidden.</p>
      )}
    </div>
  );
}
