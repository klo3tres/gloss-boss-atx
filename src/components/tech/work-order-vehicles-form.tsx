'use client';

import { useState } from 'react';

type VehicleRow = {
  year: string;
  make: string;
  model: string;
  description: string;
  color: string;
  service: string;
  vehicleClass: string;
};

const emptyRow = (): VehicleRow => ({
  year: '',
  make: '',
  model: '',
  description: '',
  color: '',
  service: '',
  vehicleClass: '',
});

export function WorkOrderVehiclesForm({
  id,
  source,
  initialVehicles,
  defaultService,
  defaultClass,
  saveAction,
}: {
  id: string;
  source: string;
  initialVehicles: VehicleRow[];
  defaultService: string;
  defaultClass: string;
  saveAction: (formData: FormData) => void | Promise<void>;
}) {
  const [rows, setRows] = useState<VehicleRow[]>(
    initialVehicles.length
      ? initialVehicles
      : [{ ...emptyRow(), service: defaultService, vehicleClass: defaultClass }],
  );

  return (
    <form action={saveAction} className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-4'>
      <input type='hidden' name='id' value={id} />
      <input type='hidden' name='source' value={source} />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Vehicles in this work order</p>
        <button
          type='button'
          onClick={() => setRows((r) => [...r, { ...emptyRow(), service: defaultService, vehicleClass: defaultClass }])}
          className='rounded-lg border border-gold/35 px-3 py-2 text-[10px] font-black uppercase text-gold-soft'
        >
          + Add vehicle
        </button>
      </div>
      <div className='mt-3 space-y-3'>
        {rows.map((v, i) => (
          <div key={i} className='rounded-xl border border-white/10 bg-black/35 p-3'>
            <p className='mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-500'>Vehicle {i + 1}</p>
            <div className='grid gap-2 sm:grid-cols-3'>
              <input name='vehicleYear' defaultValue={v.year} placeholder='Year' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='vehicleMake' defaultValue={v.make} placeholder='Make' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='vehicleModel' defaultValue={v.model} placeholder='Model' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='vehicleDescription' defaultValue={v.description} placeholder='Year / Make / Model' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' />
              <input name='vehicleColor' defaultValue={v.color} placeholder='Color' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='vehicleService' defaultValue={v.service} placeholder='Service' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='vehicleClass' defaultValue={v.vehicleClass} placeholder='Vehicle class' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </div>
          </div>
        ))}
      </div>
      <button type='submit' className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
        Save vehicles & services
      </button>
    </form>
  );
}
