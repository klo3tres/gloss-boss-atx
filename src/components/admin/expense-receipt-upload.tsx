'use client';

import { useState } from 'react';

export function ExpenseReceiptUpload({ expenseId, onDone }: { expenseId: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <label className='mt-2 inline-flex cursor-pointer items-center gap-2 text-[10px] font-black uppercase text-zinc-400'>
      <input
        type='file'
        accept='image/*,application/pdf'
        className='sr-only'
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          setBusy(true);
          try {
            const fd = new FormData();
            fd.set('expenseId', expenseId);
            fd.set('file', file);
            const res = await fetch('/api/admin/operations/expense-receipt', { method: 'POST', body: fd });
            const j = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok) throw new Error(j.error ?? 'Upload failed');
            onDone?.();
            window.location.reload();
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Upload failed');
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy ? 'Uploading…' : 'Attach gas/chemical receipt'}
    </label>
  );
}
