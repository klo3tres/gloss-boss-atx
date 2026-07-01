'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { BOOKING_WIZARD_STEPS, clampBookingStep } from '@/lib/booking/booking-wizard-steps';

export function BookingWizardNav({
  currentStep,
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
  showBack = true,
  isLastStep,
  submitLabel,
  submitting,
}: {
  currentStep: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  isLastStep?: boolean;
  submitLabel?: string;
  submitting?: boolean;
}) {
  const step = clampBookingStep(currentStep);

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-zinc-500">
        {isLastStep
          ? 'Review total in the summary, then pay securely with Stripe.'
          : `Next: ${BOOKING_WIZARD_STEPS[step + 1]?.label ?? 'Checkout'}`}
      </p>
      <div className="flex gap-2">
        {showBack && step > 0 ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 px-5 text-[10px] font-black uppercase tracking-wider text-zinc-300 hover:border-gold/30 hover:text-white sm:flex-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
        ) : null}
        {isLastStep ? (
          <button
            type="submit"
            disabled={submitting || nextDisabled}
            className="gb-premium-btn inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-soft px-6 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-50 sm:flex-none sm:min-w-[200px]"
          >
            {submitting ? 'Processing…' : submitLabel ?? 'Pay deposit'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="gb-premium-btn inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-gold-soft px-6 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-50 sm:flex-none sm:min-w-[180px]"
          >
            {nextLabel} <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
