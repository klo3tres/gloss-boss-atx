'use client';

import { useActionState, useEffect } from 'react';
import type { ActionResult } from '@/lib/action-result';

function ToastBanner({ result }: { result: ActionResult }) {
  if (result.ok) {
    return (
      <p className='mt-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100' role='status'>
        {result.message ?? 'Sent successfully.'}
      </p>
    );
  }
  return (
    <p className='mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100' role='alert'>
      {result.error ?? 'Something went wrong.'}
    </p>
  );
}

export function ToastActionForm({
  action,
  children,
  className,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
}) {
  const [result, formAction, pending] = useActionState(action, null);

  useEffect(() => {
    if (!result) return;
    const id = window.setTimeout(() => {
      /* keep banner visible; parent revalidate refreshes integration last-test row */
    }, 0);
    return () => window.clearTimeout(id);
  }, [result]);

  return (
    <form action={formAction} className={className}>
      {children}
      {pending ? (
        <p className='mt-3 text-xs font-bold uppercase tracking-wider text-gold-soft' role='status'>
          Sending…
        </p>
      ) : null}
      {result && !pending ? <ToastBanner result={result} /> : null}
    </form>
  );
}
