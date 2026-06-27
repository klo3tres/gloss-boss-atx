'use client';

import type { DayTimeWindow } from '@/lib/booking-availability';

function WindowFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DayTimeWindow;
  onChange: (w: DayTimeWindow) => void;
}) {
  return (
    <fieldset className='rounded-xl border border-white/8 bg-black/30 p-4'>
      <legend className='px-1 text-[10px] font-black uppercase tracking-wider text-zinc-400'>{label}</legend>
      <div className='mt-2 grid gap-3 sm:grid-cols-2'>
        <label className='block text-xs text-zinc-500'>
          Start hour (24h)
          <input
            type='number'
            min={0}
            max={23}
            value={value.startHour}
            onChange={(e) => onChange({ ...value, startHour: Number(e.target.value) })}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-500'>
          Start minute
          <input
            type='number'
            min={0}
            max={59}
            value={value.startMinute}
            onChange={(e) => onChange({ ...value, startMinute: Number(e.target.value) })}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-500'>
          End hour (24h)
          <input
            type='number'
            min={0}
            max={23}
            value={value.endHour}
            onChange={(e) => onChange({ ...value, endHour: Number(e.target.value) })}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-500'>
          End minute
          <input
            type='number'
            min={0}
            max={59}
            value={value.endMinute}
            onChange={(e) => onChange({ ...value, endMinute: Number(e.target.value) })}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
      </div>
    </fieldset>
  );
}

export { WindowFields };
