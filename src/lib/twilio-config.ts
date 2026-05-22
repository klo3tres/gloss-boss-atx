/** Twilio env: prefer Messaging Service SID; fall back to From number. */

export function twilioAccountSid(): string | undefined {
  return process.env.TWILIO_ACCOUNT_SID?.trim() || undefined;
}

export function twilioAuthToken(): string | undefined {
  return process.env.TWILIO_AUTH_TOKEN?.trim() || undefined;
}

export function twilioMessagingServiceSid(): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || undefined;
}

export function twilioFromNumber(): string | undefined {
  return process.env.TWILIO_FROM_NUMBER?.trim() || process.env.TWILIO_FROM?.trim() || undefined;
}

export type TwilioSendMode = 'messaging_service' | 'from_number' | 'none';

export function twilioSendMode(): TwilioSendMode {
  if (twilioMessagingServiceSid()) return 'messaging_service';
  if (twilioFromNumber()) return 'from_number';
  return 'none';
}

export function twilioCredentialsPresent(): boolean {
  return Boolean(twilioAccountSid() && twilioAuthToken());
}

export function twilioSenderReady(): boolean {
  return twilioCredentialsPresent() && twilioSendMode() !== 'none';
}
