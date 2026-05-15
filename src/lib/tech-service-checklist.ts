/** Per-service field checklist for technicians (display only). */
export function checklistForServiceSlug(slug: string): string[] {
  const base = ['Confirm vehicle condition with customer', 'Photos: before', 'Photos: after', 'Final walkthrough'];
  const s = slug.toLowerCase();
  if (s.includes('interior')) {
    return ['Vacuum interior', 'Wipe dash & console', 'Clean glass inside', ...base];
  }
  if (s.includes('exterior') && s.includes('wash')) {
    return ['Hand wash', 'Wheel & tire clean', 'Door jambs', ...base];
  }
  if (s.includes('exterior')) {
    return ['Decontamination', 'Clay if needed', 'Protection applied', ...base];
  }
  if (s.includes('full')) {
    return ['Interior complete', 'Exterior complete', 'Trim dressing', ...base];
  }
  if (s.includes('ceramic')) {
    return ['Paint assessment', 'Surface prep documented', 'Coating application per SOP', ...base];
  }
  return base;
}
