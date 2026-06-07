'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export function MembershipJoinButton({ planId, interval }: { planId: string; interval: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type='button'
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetchWithTimeout('/api/memberships/checkout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ planId, interval }),
              timeoutMs: 15000,
            });
            const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
            if (res.status === 401) {
              router.push(`/login?next=${encodeURIComponent('/memberships')}`);
              return;
            }
            if (!res.ok || !data.url) {
              setError(data.error ?? 'Checkout could not start.');
              return;
            }
            window.location.href = data.url;
          } catch {
            setError('Checkout could not start.');
          } finally {
            setBusy(false);
          }
        }}
        className='w-full rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_24px_rgba(212,175,55,0.28)] transition hover:brightness-110 disabled:opacity-50'
      >
        {busy ? 'Opening checkout...' : 'Join Plan'}
      </button>
      {error ? <p className='mt-2 text-xs text-rose-300'>{error}</p> : null}
    </div>
  );
}
