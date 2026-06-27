export type OwnerIdentityInput = {
  ownerDisplayName?: string | null;
  profileFullName?: string | null;
  profileEmail?: string | null;
};

/** Full name for greetings — workspace setting wins, then profile, then email prefix, then Owner. */
export function resolveOwnerDisplayName(input: OwnerIdentityInput): string {
  const configured = input.ownerDisplayName?.trim();
  if (configured) return configured;
  const full = input.profileFullName?.trim();
  if (full) return full;
  const emailPrefix = input.profileEmail?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;
  return 'Owner';
}

/** First name for "Good evening, Kyle" style greetings. */
export function resolveOwnerFirstName(input: OwnerIdentityInput): string {
  return resolveOwnerDisplayName(input).split(/\s+/)[0] || 'Owner';
}

export function buildOwnerGreeting(timeGreeting: string, input: OwnerIdentityInput): string {
  return `${timeGreeting}, ${resolveOwnerFirstName(input)}`;
}
