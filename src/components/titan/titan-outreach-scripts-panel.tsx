'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { OUTREACH_SCRIPTS, SCRIPT_LABELS, type OutreachScriptKey, type ScriptVariant } from '@/lib/titan/outreach-scripts';

const VARIANTS: ScriptVariant[] = ['casual', 'professional', 'short'];

export function TitanOutreachScriptsPanel() {
  const [selected, setSelected] = useState<OutreachScriptKey>('warm_lead');
  const [variant, setVariant] = useState<ScriptVariant>('casual');
  const [copied, setCopied] = useState(false);

  const text = OUTREACH_SCRIPTS[selected][variant];

  const copy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-black/40 p-5">
      <h2 className="text-sm font-black uppercase text-white">Outreach scripts</h2>
      <p className="mt-1 text-xs text-zinc-500">Copy/paste — no automated DMs. Pick a scenario and tone.</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as OutreachScriptKey)}
          className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white"
        >
          {(Object.keys(SCRIPT_LABELS) as OutreachScriptKey[]).map((k) => (
            <option key={k} value={k}>{SCRIPT_LABELS[k]}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {VARIANTS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${variant === v ? 'bg-gold text-black' : 'border border-white/10 text-zinc-400'}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-white/8 bg-white/5 p-4 text-sm text-zinc-200">{text}</p>

      <button
        type="button"
        onClick={copy}
        className="mt-3 inline-flex items-center gap-1 rounded-xl bg-emerald-500/20 px-4 py-2 text-[10px] font-black uppercase text-emerald-200"
      >
        <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy script'}
      </button>
    </section>
  );
}
