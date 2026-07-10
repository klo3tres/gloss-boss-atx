/** "Courtney Graves" → "Courtney G." */
export function formatReviewerShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Client';
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const lastInitial = parts[parts.length - 1]![0]?.toUpperCase() ?? '';
  return lastInitial ? `${first} ${lastInitial}.` : first;
}
