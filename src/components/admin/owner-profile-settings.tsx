'use client';

import { useState, useTransition } from 'react';
import { saveOwnerProfileSettingsAction, sendTestOwnerEmailAction, sendTestOwnerSmsAction } from '@/app/(dashboard)/admin/owner-settings-actions';

export function OwnerProfileSettingsForm({
  initial,
  tablesReady,
}: {
  initial: {
    ownerDisplayName: string;
    ownerEmail: string;
    ownerPhone: string;
    businessName: string;
  };
  tablesReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [ownerDisplayName, setOwnerDisplayName] = useState(initial.ownerDisplayName);
  const [ownerEmail, setOwnerEmail] = useState(initial.ownerEmail);
  const [ownerPhone, setOwnerPhone] = useState(initial.ownerPhone);
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!tablesReady) {
    return (
      <p className="text-xs text-amber-200">
        Apply migration <code className="text-amber-100">000103_owner_workspace_settings.sql</code> to save owner profile.
      </p>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    startTransition(async () => {
      const res = await saveOwnerProfileSettingsAction({ ownerDisplayName, ownerEmail, ownerPhone, businessName });
      if (res.error) setErr(res.error);
      else setMsg('Saved — Titan and alerts will use this name.');
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-zinc-500">How you are greeted in Titan and owner dashboards. Notification routing uses owner email/phone when set.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="font-black uppercase text-zinc-500">Display name</span>
          <input value={ownerDisplayName} onChange={(e) => setOwnerDisplayName(e.target.value)} placeholder="Kyle" className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white" />
        </label>
        <label className="block text-xs">
          <span className="font-black uppercase text-zinc-500">Business name</span>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Gloss Boss ATX" className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white" />
        </label>
        <label className="block text-xs">
          <span className="font-black uppercase text-zinc-500">Owner alert email</span>
          <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="you@email.com" className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white" />
        </label>
        <label className="block text-xs">
          <span className="font-black uppercase text-zinc-500">Owner alert phone (SMS)</span>
          <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="+15125551234" className="mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2.5 text-sm text-white" />
        </label>
      </div>
      <button type="submit" disabled={pending} className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50">
        Save owner profile
      </button>
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-xs text-rose-300">{err}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/8 pt-4">
        <button type="button" disabled={pending} onClick={() => startTransition(async () => { setErr(null); setMsg(null); const res = await sendTestOwnerEmailAction(); if (res.error) setErr(res.error); else setMsg('Test email sent.'); })} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">
          Send test owner email
        </button>
        <button type="button" disabled={pending} onClick={() => startTransition(async () => { setErr(null); setMsg(null); const res = await sendTestOwnerSmsAction(); if (res.error) setErr(res.error); else setMsg('Test SMS sent (or queued).'); })} className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">
          Send test owner SMS
        </button>
      </div>
    </form>
  );
}
