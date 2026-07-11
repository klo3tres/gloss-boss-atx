'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  OPPORTUNITY_NOTE_LABELS,
  newOpportunityNotePad,
  parseOpportunityNotePads,
  type OpportunityNotePad,
} from '@/lib/titan/opportunity-note-pads';
import { saveOpportunityNotePadsAction } from '@/app/(dashboard)/admin/titan/opportunity-actions';

const AUTOSAVE_MS = 600;

export function OpportunityNotesWorkspace({
  opportunityId,
  initialNotes,
}: {
  opportunityId: string;
  initialNotes: string | null;
}) {
  const [pads, setPads] = useState<OpportunityNotePad[]>(() => parseOpportunityNotePads(initialNotes));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const padsRef = useRef(pads);
  padsRef.current = pads;

  useEffect(() => {
    setPads(parseOpportunityNotePads(initialNotes));
  }, [opportunityId, initialNotes]);

  const persist = useCallback(
    (next: OpportunityNotePad[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSaveState('saving');
        startTransition(async () => {
          const res = await saveOpportunityNotePadsAction(
            opportunityId,
            next.map((p) => ({ ...p, updatedAt: new Date().toISOString() })),
          );
          setSaveState(res.error ? 'error' : 'saved');
        });
      }, AUTOSAVE_MS);
    },
    [opportunityId],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const updatePad = (id: string, patch: Partial<OpportunityNotePad>) => {
    setPads((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p));
      persist(next);
      return next;
    });
  };

  const addPad = () => {
    if (pads.length >= 8) return;
    setPads((prev) => {
      const next = [...prev, newOpportunityNotePad(OPPORTUNITY_NOTE_LABELS[prev.length] ?? 'General')];
      persist(next);
      return next;
    });
  };

  const removePad = (id: string) => {
    setPads((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persist(next);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Notes</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">Up to 8 pads · autosaves</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase text-muted-foreground">
            {saveState === 'saving' || pending ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save failed' : null}
          </span>
          <button
            type="button"
            disabled={pads.length >= 8}
            onClick={addPad}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase text-foreground disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> Add note
          </button>
        </div>
      </div>

      {pads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          No notes yet — add Discovery, Decision maker, or Follow-up pads.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pads.map((pad) => (
            <article key={pad.id} className="flex flex-col rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <select
                  value={pad.label}
                  onChange={(e) => updatePad(pad.id, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-input px-2 py-1.5 text-[10px] font-black uppercase text-foreground"
                >
                  {OPPORTUNITY_NOTE_LABELS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                  {!OPPORTUNITY_NOTE_LABELS.includes(pad.label as (typeof OPPORTUNITY_NOTE_LABELS)[number]) ? (
                    <option value={pad.label}>{pad.label}</option>
                  ) : null}
                </select>
                <button
                  type="button"
                  onClick={() => removePad(pad.id)}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:border-rose-500/30 hover:text-rose-400"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <textarea
                value={pad.body}
                onChange={(e) => updatePad(pad.id, { body: e.target.value })}
                rows={4}
                placeholder={`${pad.label} notes…`}
                className="min-h-[96px] flex-1 resize-y rounded-lg border border-border bg-input px-3 py-2 text-xs text-foreground"
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
