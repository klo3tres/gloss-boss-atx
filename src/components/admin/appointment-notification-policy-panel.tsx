import type { AppointmentNotificationPolicy } from '@/lib/appointment-notification-policy';
import { updateAppointmentNotificationPolicyAction } from '@/app/(dashboard)/admin/settings/actions';

export function AppointmentNotificationPolicyPanel({ policy, canEdit }: { policy: AppointmentNotificationPolicy; canEdit: boolean }) {
  const input = 'mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white';
  return <form action={updateAppointmentNotificationPolicyAction} className="rounded-2xl border border-white/10 bg-black/45 p-5">
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Appointment operations alerts</p>
    <p className="mt-2 text-xs text-zinc-500">Controls acknowledgment, on-the-way, late-start, and estimated-duration escalations. Closed, flexible, rescheduled, and approved-delay jobs are excluded.</p>
    <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300"><input name="enabled" type="checkbox" defaultChecked={policy.enabled} disabled={!canEdit} /> Enable operational alerts</label>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['acknowledgeMinutesBefore','Acknowledge before start',policy.acknowledgeMinutesBefore],['onWayMinutesBefore','On-way before start',policy.onWayMinutesBefore],['firstLateMinutes','First late alert after',policy.firstLateMinutes],['secondLateMinutes','Second late alert after',policy.secondLateMinutes],['overrunGraceMinutes','Overrun grace',policy.overrunGraceMinutes],['cooldownMinutes','Cooldown',policy.cooldownMinutes],['maximumSendsPerRule','Max sends per rule',policy.maximumSendsPerRule]].map(([name,label,value]) => <label key={String(name)} className="text-xs text-zinc-400">{label} {name === 'maximumSendsPerRule' ? '' : '(minutes)'}<input name={String(name)} type="number" min="0" defaultValue={Number(value)} className={input} disabled={!canEdit} /></label>)}
    </div>
    {canEdit ? <button type="submit" className="mt-4 rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black">Save operations alerts</button> : null}
  </form>;
}
