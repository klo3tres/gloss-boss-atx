'use client';

import { useState, useTransition } from 'react';
import type { BusinessApiKey } from '@/lib/titan/api-keys';
import { createApiKeyAction, revokeApiKeyAction } from '@/app/(dashboard)/titan/actions';

export function TitanApiKeysClient({ keys, businessId }: { keys: BusinessApiKey[]; businessId: string }) {
  const [pending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">API keys</h2>
        <p className="mt-1 text-sm text-zinc-400">
          POST leads from any website form to <code className="text-amber-200">/api/titan/leads</code> with your API key.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/50 p-4 text-xs text-zinc-400">
        <p className="font-bold text-zinc-200">Example</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-300">{`curl -X POST ${appUrl}/api/titan/leads \\
  -H "Authorization: Bearer titan_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane","email":"jane@co.com","service_interest":"SEO","message":"Need help"}'`}</pre>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await createApiKeyAction();
            if (res.error) setError(res.error);
            else if (res.rawKey) setNewKey(res.rawKey);
          })
        }
        className="rounded-xl bg-amber-500 px-4 py-2 text-[10px] font-black uppercase text-black"
      >
        Create API key
      </button>

      {newKey ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-xs font-bold text-amber-100">Copy this key now — it won&apos;t be shown again.</p>
          <code className="mt-2 block break-all font-mono text-sm text-white">{newKey}</code>
        </div>
      ) : null}

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-xs">
            <div>
              <p className="font-bold text-white">{k.name}</p>
              <p className="text-zinc-500">
                {k.keyPrefix}… · {k.scopes.join(', ')}
                {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ''}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await revokeApiKeyAction(k.id);
                  window.location.reload();
                })
              }
              className="rounded-lg border border-rose-500/30 px-2 py-1 text-[10px] font-black uppercase text-rose-300"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
