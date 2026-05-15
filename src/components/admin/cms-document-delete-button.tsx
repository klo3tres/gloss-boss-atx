'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

export function CmsDocumentDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <>
      <button
        type='button'
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setErr(null);
            const res = await fetchWithTimeout(`/api/admin/cms-documents?id=${encodeURIComponent(id)}`, {
              method: 'DELETE',
              credentials: 'same-origin',
              timeoutMs: 20000,
            });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
            setBusy(false);
            if (!res.ok || !data.ok) {
              setErr(data.error ?? 'Delete failed');
              return;
            }
            router.refresh();
          })();
        }}
        className='text-xs text-red-300 disabled:opacity-40'
      >
        {busy ? '…' : 'Delete'}
      </button>
      {err ? <span className='ml-2 text-[10px] text-rose-300'>{err}</span> : null}
    </>
  );
}
