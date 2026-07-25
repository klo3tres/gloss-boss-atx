export function deliverableCustomerEmail(value: unknown): string {
  const email = value == null ? '' : String(value).trim().toLowerCase();
  if (!email.includes('@') || email.endsWith('.invalid') || email.endsWith('@example.com')) return '';
  return email;
}
