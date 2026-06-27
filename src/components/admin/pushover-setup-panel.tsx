'use client';

import { useState, useTransition } from 'react';
import { sendTestPushoverAction } from '@/app/(dashboard)/admin/notifications/titan-notification-actions';
import { useToast } from '@/components/ui/toast-provider';
import { Smartphone } from 'lucide-react';

export function PushoverSetupPanel({ configured }: { configured: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-white/10 bg-black/45 p-5">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 text-gold-soft" />
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Pushover app alerts</p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            Download Pushover on iPhone, create an application, then paste your User Key and App Token into Vercel env vars.
            Pushover sends app notifications directly to your phone — no webhook needed.
          </p>
          <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase ${configured ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'}`}>
            {configured ? 'Configured' : 'Missing PUSHOVER_APP_TOKEN / PUSHOVER_USER_KEY'}
          </p>
          <button
            type="button"
            disabled={pending || !configured}
            onClick={() => {
              startTransition(async () => {
                const res = await sendTestPushoverAction();
                if (res.error) toast.error('Pushover failed', res.error);
                else toast.success('Pushover sent', 'Check your phone.');
              });
            }}
            className="mt-4 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-40"
          >
            {pending ? 'Sending…' : 'Send test Pushover'}
          </button>
        </div>
      </div>
    </div>
  );
}
