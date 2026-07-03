'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { UserRound } from 'lucide-react';
import { assignAppointmentTechnicianAction } from '@/app/(dashboard)/admin/dispatch-job-actions';
import Link from 'next/link';

export function WorkOrderAssigneeChip({
  appointmentId,
  technicianName,
  assignedTechnicianId,
  technicians,
  canReassign,
}: {
  appointmentId: string;
  technicianName: string;
  assignedTechnicianId?: string | null;
  technicians?: Array<{ id: string; name: string }>;
  canReassign?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const unassigned = !assignedTechnicianId && !technicianName;

  if (canReassign && technicians && technicians.length > 0) {
    return (
      <div>
        <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
          <UserRound className="h-3 w-3" /> Assigned tech
        </p>
        <form
          className="mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set('appointmentId', appointmentId);
            startTransition(async () => {
              const res = await assignAppointmentTechnicianAction(fd);
              setMsg(res.ok ? 'Assigned' : res.error ?? 'Failed');
              if (res.ok) router.refresh();
            });
          }}
        >
          <select
            name="technicianId"
            defaultValue={assignedTechnicianId ?? ''}
            disabled={pending}
            className="w-full rounded-lg border border-white/10 bg-black px-2 py-1.5 text-[11px] font-semibold text-white"
          >
            <option value="">Unassigned</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded-lg border border-gold/30 px-2 py-1 text-[9px] font-black uppercase text-gold-soft disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save assignee'}
          </button>
        </form>
        {msg ? <p className="mt-1 text-[9px] text-emerald-300">{msg}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider flex items-center gap-1">
        <UserRound className="h-3 w-3" /> Assigned tech
      </p>
      {unassigned ? (
        <Link href="/admin/dispatch" className="mt-1 inline-block text-[11px] font-bold text-amber-300 hover:underline">
          Unassigned — open dispatch
        </Link>
      ) : (
        <p className="font-semibold text-zinc-300 mt-1">{technicianName || 'Assigned'}</p>
      )}
    </div>
  );
}
