'use client';

const TABS: { id: string; label: string }[] = [
  { id: 'wo-overview', label: 'Overview' },
  { id: 'wo-agreement', label: 'Agreement' },
  { id: 'wo-photos', label: 'Photos' },
  { id: 'wo-preinspect', label: 'Checklist' },
  { id: 'wo-payment', label: 'Invoice' },
  { id: 'wo-notes', label: 'Notes' },
  { id: 'wo-timeline', label: 'Timeline' },
];

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function WorkOrderSectionTabs() {
  return (
    <nav
      className='gb-no-print gb-tab-rail mb-4 rounded-2xl border border-gold/15 bg-black/50 px-2 py-2'
      aria-label='Work order sections'
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type='button'
          onClick={() => scrollToId(t.id)}
          className='gb-tab-pill'
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
