'use client';

import { useState, useTransition } from 'react';
import { saveExternalPaymentSettingsAction } from '@/app/(dashboard)/admin/settings/actions';
import type { ExternalPaymentMethodKey, ExternalPaymentSettings } from '@/lib/external-payment-settings';

const ORDER: ExternalPaymentMethodKey[] = [
  'cash',
  'cash_app',
  'zelle',
  'venmo',
  'apple_pay_personal',
  'check',
  'bank_transfer',
];

export function ExternalPaymentSettingsPanel({ initial }: { initial: ExternalPaymentSettings }) {
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const update = (key: ExternalPaymentMethodKey, patch: Partial<ExternalPaymentSettings[ExternalPaymentMethodKey]>) => {
    setSettings((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  };

  const save = () => {
    startTransition(async () => {
      setMessage(null);
      const result = await saveExternalPaymentSettingsAction(settings);
      setMessage(result.error ?? 'External payment settings saved.');
    });
  };

  return (
    <section className='rounded-2xl border border-white/10 bg-black/40 p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <p className='text-sm font-black text-white'>Customer-facing payment methods</p>
          <p className='mt-1 max-w-2xl text-xs text-zinc-500'>
            Disabled methods and their private instructions never appear on a customer booking page. Direct Apple Pay is recorded manually; Apple Pay through checkout remains Stripe-managed.
          </p>
        </div>
        <button type='button' disabled={pending} onClick={save} className='min-h-11 rounded-xl bg-gold px-5 text-xs font-black uppercase text-black disabled:opacity-50'>
          {pending ? 'Saving…' : 'Save payment methods'}
        </button>
      </div>

      <div className='mt-5 space-y-3'>
        {ORDER.map((key) => {
          const method = settings[key];
          return (
            <div key={key} className='rounded-2xl border border-white/10 bg-zinc-950/70 p-4'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <label className='flex min-h-11 items-center gap-3 text-sm font-black text-white'>
                  <input type='checkbox' checked={method.enabled} onChange={(event) => update(key, { enabled: event.target.checked })} className='h-5 w-5 accent-gold' />
                  {method.label}
                </label>
                <label className='flex items-center gap-2 text-xs text-zinc-400'>
                  <input type='checkbox' checked={method.proofRequired} onChange={(event) => update(key, { proofRequired: event.target.checked })} className='h-4 w-4 accent-gold' />
                  Reference or proof required
                </label>
              </div>
              <label className='mt-3 block text-xs font-bold text-zinc-400'>
                Customer-facing instructions
                <textarea
                  value={method.instructions}
                  onChange={(event) => update(key, { instructions: event.target.value })}
                  disabled={!method.enabled}
                  rows={2}
                  placeholder={method.enabled ? 'Only enter information you want customers to see.' : 'Enable this method before adding instructions.'}
                  className='mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white disabled:opacity-40'
                />
              </label>
            </div>
          );
        })}
      </div>
      {message ? <p className='mt-3 text-sm text-zinc-300' role='status'>{message}</p> : null}
    </section>
  );
}
