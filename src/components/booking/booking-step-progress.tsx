'use client';

import { Check } from 'lucide-react';
import { BOOKING_WIZARD_STEPS, clampBookingStep } from '@/lib/booking/booking-wizard-steps';

export function BookingStepProgress({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick?: (step: number) => void;
}) {
  const step = clampBookingStep(currentStep);
  const progress = ((step + 1) / BOOKING_WIZARD_STEPS.length) * 100;

  return (
    <div className="rounded-2xl border border-border bg-card/95 p-3 backdrop-blur-md sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">
          Step {step + 1} of {BOOKING_WIZARD_STEPS.length}
        </p>
        <p className="text-[10px] font-bold uppercase text-muted-foreground">{BOOKING_WIZARD_STEPS[step]?.label}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-gradient-to-r from-gold to-gold-soft transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <ol className="mt-3 flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden">
        {BOOKING_WIZARD_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const clickable = onStepClick && i <= step;
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(i)}
                className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-2 text-[9px] font-bold uppercase ${
                  active
                    ? 'border-gold bg-gold/15 text-gold-soft'
                    : done
                      ? 'border-emerald-500/30 text-emerald-700'
                      : 'border-border text-muted-foreground'
                }`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1} {s.short}
              </button>
            </li>
          );
        })}
      </ol>
      <ol className="mt-4 hidden gap-1 sm:flex">
        {BOOKING_WIZARD_STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const clickable = onStepClick && i <= step;
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(i)}
                className={`flex w-full flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition ${
                  active
                    ? 'bg-gold/10 text-gold-soft'
                    : done
                      ? 'text-emerald-700 hover:bg-muted/50'
                      : 'text-muted-foreground'
                } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-black ${
                    active
                      ? 'border-gold bg-gold text-black'
                      : done
                        ? 'border-emerald-500/40 bg-emerald-500/15'
                        : 'border-border'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="truncate text-[9px] font-bold uppercase tracking-wide">{s.short}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
