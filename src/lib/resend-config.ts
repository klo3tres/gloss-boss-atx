export function resendFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() ?? '';
}

export function resendDomainVerified(): boolean {
  const from = resendFromEmail().toLowerCase();
  if (!from.includes('@')) return false;
  const domain = from.split('@')[1] ?? '';
  return domain === 'glossbossatx.com' || domain.endsWith('.glossbossatx.com');
}

export function resendDomainWarning(): string | null {
  if (!process.env.RESEND_API_KEY?.trim()) return null;
  const from = resendFromEmail();
  if (!from) return 'RESEND_FROM_EMAIL is not set.';
  if (!resendDomainVerified()) {
    return 'Resend DNS not verified yet. Emails to customers will fail until verification completes.';
  }
  return null;
}

export function parseResendError(body: string, status: number): string {
  if (status === 403 || /only send testing emails|verify a domain/i.test(body)) {
    return 'Resend domain is not verified yet. Verify glossbossatx.com in Resend before sending to customers.';
  }
  return body.slice(0, 500) || `Resend HTTP ${status}`;
}
