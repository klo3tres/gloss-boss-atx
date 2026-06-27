'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import { toggleDailyHuntTaskAction } from '@/app/(dashboard)/admin/titan/lead-radar-actions';

type Task = {
  taskKey: string;
  label: string;
  completed: boolean;
  id: string | null;
};

export function TitanDailyHuntChecklist({
  tasks,
  tablesReady,
  taskDate,
}: {
  tasks: Task[];
  tablesReady: boolean;
  taskDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!tablesReady) {
    return (
      <section className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-5">
        <h2 className="text-sm font-black uppercase text-white">Today&apos;s Customer Hunt</h2>
        <p className="mt-2 text-xs text-amber-100">Apply migration <code className="text-amber-200">000102_titan_lead_radar_v2.sql</code> to persist checklist.</p>
      </section>
    );
  }

  const done = tasks.filter((t) => t.completed).length;

  return (
    <section className="rounded-3xl border border-cyan-500/20 bg-black/55 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">Today&apos;s Customer Hunt</p>
          <p className="mt-1 text-sm text-zinc-500">{taskDate} · {done}/{tasks.length} complete</p>
        </div>
        <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-cyan-500 transition-all" style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} />
        </div>
      </div>

      <ul className="mt-5 space-y-2">
        {tasks.map((task) => (
          <li key={task.taskKey}>
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => {
                await toggleDailyHuntTaskAction(task.taskKey, !task.completed);
                router.refresh();
              })}
              className="flex w-full items-center gap-3 rounded-xl border border-white/8 bg-black/40 px-4 py-3 text-left hover:border-cyan-500/30 disabled:opacity-50"
            >
              {task.completed ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-zinc-600" />
              )}
              <span className={`text-sm ${task.completed ? 'text-zinc-500 line-through' : 'text-white'}`}>{task.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
