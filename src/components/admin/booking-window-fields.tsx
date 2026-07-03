'use client';

import type { DayTimeWindow } from '@/lib/booking-availability';

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = [0, 15, 30, 45];

function HourSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
      >
        {HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`} ({String(h).padStart(2, '0')}:00)
          </option>
        ))}
      </select>
    </label>
  );
}

function MinuteSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-xs text-zinc-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
      >
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            :{String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
    </label>
  );
}

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
        <HourSelect label="Start hour" value={value.startHour} onChange={(startHour) => onChange({ ...value, startHour })} />
        <MinuteSelect label="Start minute" value={value.startMinute} onChange={(startMinute) => onChange({ ...value, startMinute })} />
        <HourSelect label="End hour" value={value.endHour} onChange={(endHour) => onChange({ ...value, endHour })} />
        <MinuteSelect label="End minute" value={value.endMinute} onChange={(endMinute) => onChange({ ...value, endMinute })} />
      </div>
    </fieldset>
  );
}

export { WindowFields };
