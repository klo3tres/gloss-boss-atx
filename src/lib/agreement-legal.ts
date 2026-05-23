import { buildNativeAgreementSnapshot, DEFAULT_AGREEMENT_TITLE } from '@/lib/default-gloss-boss-agreement';

export function snapshotHasLegalTerms(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 120) return false;
  return (
    t.includes('liability') ||
    t.includes('acknowledgement') ||
    t.includes('acknowledgment') ||
    t.includes('pre-existing') ||
    t.includes('electronic signature')
  );
}

export function resolveAgreementBody(snapshot: unknown): { body: string; legacyTermsWarning: boolean } {
  let raw = '';
  if (typeof snapshot === 'string' && snapshot.trim()) raw = snapshot.trim();
  else if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const row = snapshot as Record<string, unknown>;
    raw =
      (typeof row.body === 'string' && row.body.trim()) ||
      (typeof row.agreement_text === 'string' && row.agreement_text.trim()) ||
      (typeof row.terms === 'string' && row.terms.trim()) ||
      '';
  }

  if (snapshotHasLegalTerms(raw)) {
    return { body: raw, legacyTermsWarning: false };
  }

  const fallback = buildNativeAgreementSnapshot({
    customerName: 'Customer',
    vehicleDescription: 'As described at booking.',
    serviceLabel: 'Mobile detailing',
    vehicleClassLabel: 'Standard',
    totalDollars: '0.00',
    depositNote: 'Per booking policy.',
  });

  if (raw) {
    return {
      body: `${raw}\n\n--- CURRENT LEGAL TERMS (legacy snapshot lacked full terms) ---\n\n${fallback}`,
      legacyTermsWarning: true,
    };
  }

  return { body: fallback, legacyTermsWarning: false };
}

export { DEFAULT_AGREEMENT_TITLE };
