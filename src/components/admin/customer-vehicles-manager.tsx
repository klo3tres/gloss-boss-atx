'use client';

import { useState } from 'react';
import {
  addCustomerVehicleAction,
  archiveCustomerVehicleAction,
  updateCustomerVehicleAction,
} from '@/app/(dashboard)/admin/customer-vehicle-actions';

export type CustomerVehicleRow = {
  id: string;
  description: string;
  notes: string | null;
  created_at: string;
};

function parseNotes(notes: string | null) {
  if (!notes) return { year: '', make: '', model: '', color: '', vehicleClass: 'sedan', archived: false };
  if (notes.startsWith('[archived]')) {
    try {
      const j = JSON.parse(notes.replace('[archived]', '').trim()) as Record<string, string>;
      return { year: j.year ?? '', make: j.make ?? '', model: j.model ?? '', color: j.color ?? '', vehicleClass: j.vehicle_class ?? 'sedan', archived: true };
    } catch {
      return { year: '', make: '', model: '', color: '', vehicleClass: 'sedan', archived: true };
    }
  }
  try {
    const j = JSON.parse(notes) as Record<string, string>;
    return { year: j.year ?? '', make: j.make ?? '', model: j.model ?? '', color: j.color ?? '', vehicleClass: j.vehicle_class ?? 'sedan', archived: false };
  } catch {
    return { year: '', make: '', model: '', color: '', vehicleClass: 'sedan', archived: false };
  }
}

function VehicleFields({
  customerId,
  vehicleId,
  initial,
  action,
  submitLabel,
}: {
  customerId: string;
  vehicleId?: string;
  initial: ReturnType<typeof parseNotes> & { description: string };
  action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>;
  submitLabel: string;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const res = await action(fd);
    setBusy(false);
    setMsg(res.ok ? 'Saved.' : res.error ?? 'Failed');
    if (res.ok) e.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className='mt-3 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-4 sm:grid-cols-2'>
      <input type='hidden' name='customerId' value={customerId} />
      {vehicleId ? <input type='hidden' name='vehicleId' value={vehicleId} /> : null}
      <input name='year' defaultValue={initial.year} placeholder='Year' className='gb-input' />
      <input name='make' defaultValue={initial.make} placeholder='Make' className='gb-input' />
      <input name='model' defaultValue={initial.model} placeholder='Model' className='gb-input' />
      <input name='color' defaultValue={initial.color} placeholder='Color' className='gb-input' />
      <select name='vehicleClass' defaultValue={initial.vehicleClass} className='gb-input sm:col-span-2'>
        <option value='sedan'>Sedan</option>
        <option value='suv'>SUV</option>
        <option value='truck'>Truck</option>
      </select>
      <button type='submit' disabled={busy} className='sm:col-span-2 rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50'>
        {busy ? 'Saving…' : submitLabel}
      </button>
      {msg ? <p className='sm:col-span-2 text-xs text-zinc-400'>{msg}</p> : null}
    </form>
  );
}

function ArchiveVehicleButton({
  customerId,
  vehicleId,
  meta,
}: {
  customerId: string;
  vehicleId: string;
  meta: ReturnType<typeof parseNotes>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type='button'
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const fd = new FormData();
        fd.set('customerId', customerId);
        fd.set('vehicleId', vehicleId);
        fd.set('year', meta.year);
        fd.set('make', meta.make);
        fd.set('model', meta.model);
        fd.set('color', meta.color);
        fd.set('vehicleClass', meta.vehicleClass);
        await archiveCustomerVehicleAction(fd);
        setBusy(false);
        window.location.reload();
      }}
      className='mt-2 text-xs font-bold uppercase text-red-300 underline disabled:opacity-50'
    >
      {busy ? 'Archiving…' : 'Archive vehicle'}
    </button>
  );
}

export function CustomerVehiclesManager({ customerId, vehicles }: { customerId: string; vehicles: CustomerVehicleRow[] }) {
  const active = vehicles.filter((v) => !parseNotes(v.notes).archived);

  return (
    <div className='space-y-4'>
      <VehicleFields
        customerId={customerId}
        initial={{ year: '', make: '', model: '', color: '', vehicleClass: 'sedan', archived: false, description: '' }}
        action={addCustomerVehicleAction}
        submitLabel='Add vehicle'
      />
      <ul className='space-y-3'>
        {active.length === 0 ? <li className='text-sm text-zinc-500'>No vehicles on file — add one above.</li> : null}
        {active.map((v) => {
          const meta = parseNotes(v.notes);
          return (
            <li key={v.id} className='rounded-xl border border-white/10 bg-black/20 p-4'>
              <p className='font-semibold text-white'>{v.description}</p>
              <p className='text-xs text-zinc-500'>Added {new Date(v.created_at).toLocaleDateString()}</p>
              <VehicleFields
                customerId={customerId}
                vehicleId={v.id}
                initial={{ ...meta, description: v.description }}
                action={updateCustomerVehicleAction}
                submitLabel='Update vehicle'
              />
              <ArchiveVehicleButton
                customerId={customerId}
                vehicleId={v.id}
                meta={meta}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
