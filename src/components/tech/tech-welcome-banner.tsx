'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Settings, X } from 'lucide-react';

export function TechWelcomeBanner({
  techName,
  roleLabel,
  jobCount,
}: {
  techName: string;
  roleLabel: string | null;
  jobCount: number;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !window.sessionStorage.getItem('gb_tech_welcome_seen');
  });

  if (!open) return null;

  return (
    <div className="mb-6 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/10 to-zinc-950 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Welcome aboard</p>
          <h2 className="mt-1 text-lg font-black text-white">Hi {techName.split(' ')[0] || 'tech'} — you&apos;re set up</h2>
          <p className="mt-2 text-xs text-zinc-400">
            Role: <strong className="text-zinc-200">{roleLabel?.replace('_', ' ') ?? 'Technician'}</strong>
            {' · '}
            {jobCount > 0 ? `${jobCount} job${jobCount === 1 ? '' : 's'} on your board today` : 'No assigned jobs yet — check back soon'}
          </p>
          <p className="mt-2 text-xs text-zinc-500">Confirm phone/email in settings and set notification preferences.</p>
          <Link
            href="/tech/settings"
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20"
          >
            <Settings className="h-3 w-3" /> Open settings
          </Link>
        </div>
        <button
          type="button"
          aria-label="Dismiss welcome"
          onClick={() => {
            window.sessionStorage.setItem('gb_tech_welcome_seen', '1');
            setOpen(false);
          }}
          className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
