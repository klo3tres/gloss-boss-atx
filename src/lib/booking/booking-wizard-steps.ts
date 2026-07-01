export const BOOKING_WIZARD_STEPS = [
  { id: 'vehicle', label: 'Vehicle', short: 'Vehicle' },
  { id: 'service', label: 'Service', short: 'Service' },
  { id: 'addons', label: 'Add-ons', short: 'Add-ons' },
  { id: 'schedule', label: 'Date & time', short: 'Schedule' },
  { id: 'contact', label: 'Contact', short: 'Contact' },
  { id: 'payment', label: 'Payment', short: 'Pay' },
] as const;

export type BookingWizardStepId = (typeof BOOKING_WIZARD_STEPS)[number]['id'];

export type BookingStepValidation = { ok: true } | { ok: false; message: string; focusStep?: number };

export function clampBookingStep(step: number): number {
  return Math.max(0, Math.min(BOOKING_WIZARD_STEPS.length - 1, Math.floor(step)));
}
