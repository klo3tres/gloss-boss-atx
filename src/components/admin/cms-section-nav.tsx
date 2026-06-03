'use client';

const SECTIONS = [
  { id: 'cms-booking', label: 'Booking hours' },
  { id: 'cms-brand', label: 'Brand assets' },
  { id: 'cms-homepage', label: 'Homepage' },
  { id: 'cms-featured', label: 'Transformations' },
  { id: 'cms-gallery', label: 'Gallery' },
  { id: 'cms-promotions', label: 'Promotions' },
  { id: 'cms-documents', label: 'Documents' },
] as const;

export function CmsSectionNav() {
  return (
    <nav className='mb-8 rounded-2xl border border-gold/20 bg-black/50 p-3 backdrop-blur'>
      <p className='mb-2 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>CMS sections</p>
      <div className='flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className='shrink-0 rounded-full border border-white/10 bg-zinc-950/80 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-300 transition hover:border-gold/40 hover:text-gold-soft'
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
