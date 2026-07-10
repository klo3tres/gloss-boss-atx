'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTitanProjectAction } from '@/app/(dashboard)/titan/actions';

export function TitanProjectsPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const res = await createTitanProjectAction(formData);
          if (res.ok) router.refresh();
        });
      }}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <p className="text-xs font-black uppercase tracking-wider text-gold-soft">New project</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <input
          name="title"
          required
          placeholder="Project title"
          className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground sm:col-span-2"
        />
        <select name="project_type" className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground">
          <option value="detailing_job">Detailing job</option>
          <option value="website_build">Website build</option>
          <option value="retainer">Retainer</option>
          <option value="fleet_contract">Fleet contract</option>
          <option value="other">Other</option>
        </select>
        <input
          name="due_at"
          type="date"
          className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground"
        />
        <textarea
          name="notes"
          rows={2}
          placeholder="Notes (optional)"
          className="rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-foreground sm:col-span-2"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create project'}
      </button>
    </form>
  );
}
