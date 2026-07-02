export type SideEffectStatus = 'ok' | 'failed' | 'skipped' | 'pending' | 'sent' | 'delivered';

export type CustomerConfirmationStatus = {
  email: SideEffectStatus | string;
  sms: SideEffectStatus | string;
  portalUrl?: string;
  error?: string;
};

export type CreateAdminJobResult = {
  success: boolean;
  workOrderId?: string;
  appointmentId?: string;
  customerId?: string | null;
  errors: string[];
  warnings: string[];
  customerStatus?: 'created' | 'matched' | 'failed' | 'skipped';
  vehicleStatus?: 'synced' | 'failed' | 'skipped';
  calendarBlockStatus?: SideEffectStatus;
  googleCalendarStatus?: SideEffectStatus;
  ownerNotificationStatus?: SideEffectStatus;
  customerConfirmation?: CustomerConfirmationStatus;
  portalUrl?: string;
  paymentStatus?: SideEffectStatus;
};

export function failedAdminJobResult(error: string, extra?: Partial<CreateAdminJobResult>): CreateAdminJobResult {
  return {
    success: false,
    errors: [error, ...(extra?.errors ?? [])],
    warnings: extra?.warnings ?? [],
    ...extra,
  };
}
