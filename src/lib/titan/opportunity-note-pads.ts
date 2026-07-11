/** Structured opportunity note pads stored in titan_opportunities.notes as JSON. */

export const OPPORTUNITY_NOTE_LABELS = [
  'Discovery',
  'Decision maker',
  'Gatekeeper',
  'Budget',
  'Timeline',
  'Objections',
  'Follow-up',
  'General',
] as const;

export type OpportunityNoteLabel = (typeof OPPORTUNITY_NOTE_LABELS)[number];

export type OpportunityNotePad = {
  id: string;
  label: OpportunityNoteLabel | string;
  body: string;
  updatedAt: string;
};

const PADS_MARKER = '"pads"';

export function parseOpportunityNotePads(raw: string | null | undefined): OpportunityNotePad[] {
  const text = (raw ?? '').trim();
  if (!text) return [];
  if (text.startsWith('{') && text.includes(PADS_MARKER)) {
    try {
      const parsed = JSON.parse(text) as { pads?: OpportunityNotePad[] };
      if (Array.isArray(parsed.pads)) {
        return parsed.pads
          .filter((p) => p && typeof p.id === 'string')
          .slice(0, 8)
          .map((p) => ({
            id: String(p.id),
            label: String(p.label || 'General'),
            body: String(p.body ?? ''),
            updatedAt: String(p.updatedAt || new Date().toISOString()),
          }));
      }
    } catch {
      /* fall through to legacy */
    }
  }
  return [
    {
      id: 'legacy-1',
      label: 'General',
      body: text,
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function serializeOpportunityNotePads(pads: OpportunityNotePad[]): string {
  const cleaned = pads.slice(0, 8).map((p) => ({
    id: p.id,
    label: p.label || 'General',
    body: p.body ?? '',
    updatedAt: p.updatedAt || new Date().toISOString(),
  }));
  return JSON.stringify({ pads: cleaned, v: 1 });
}

export function newOpportunityNotePad(label: OpportunityNoteLabel | string = 'General'): OpportunityNotePad {
  return {
    id: `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    body: '',
    updatedAt: new Date().toISOString(),
  };
}
