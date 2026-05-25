import Link from 'next/link';
import { PublicGalleryPortfolio } from '@/components/marketing/public-gallery-portfolio';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';

export const metadata = {
  title: 'Gallery | Gloss Boss ATX',
  description: 'Before and after mobile detailing transformations in Austin, TX.',
};

export default function GalleryPage() {
  return (
    <main className='gb-luxury-page min-h-screen bg-background text-foreground'>
      <header className='border-b border-gold/20 bg-black/80 px-4 py-6 backdrop-blur sm:px-8'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4'>
          <Link href='/' className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>
            Gloss Boss ATX
          </Link>
          <nav className='flex gap-4 text-xs font-bold uppercase'>
            <Link href='/services' className='text-zinc-400 hover:text-gold-soft'>
              Services
            </Link>
            <Link href='/book' className='rounded-lg bg-gold px-4 py-2 text-black'>
              Book
            </Link>
          </nav>
        </div>
      </header>

      <div className='mx-auto max-w-6xl px-4 py-16 sm:px-8'>
        <p className='text-xs font-black uppercase tracking-[0.3em] text-gold-soft'>Transformation portfolio</p>
        <h1 className='mt-3 text-4xl font-black uppercase sm:text-5xl'>Real results</h1>
        <p className='mt-4 max-w-2xl text-sm text-zinc-400'>
          Before/after documentation from Gloss Boss ATX mobile detailing. Tap any image for full-screen view.
        </p>
        <div className='mt-12'>
          <PublicGalleryPortfolio />
        </div>
      </div>

      <MarketingSiteFooter />
    </main>
  );
}
