import Link from 'next/link';
import { PublicGalleryPortfolio } from '@/components/marketing/public-gallery-portfolio';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';

export const metadata = {
  title: 'Gallery | Gloss Boss ATX',
  description: 'Before and after mobile detailing transformations in Austin, TX.',
};

export default function GalleryPage() {
  return (
    <main className='gb-page min-h-screen text-foreground'>
      <header className='gb-luxury-nav border-b border-gold/20 px-4 py-6 backdrop-blur sm:px-8'>
        <div className='mx-auto flex max-w-6xl items-center justify-between gap-4'>
          <Link href='/' className='gb-eyebrow'>
            Gloss Boss ATX
          </Link>
          <nav className='flex flex-wrap gap-3 text-xs font-bold uppercase'>
            <Link href='/services' className='text-zinc-400 transition hover:text-gold-soft'>
              Services
            </Link>
            <Link href='/book' className='rounded-lg bg-gold px-4 py-2 text-black'>
              Book
            </Link>
          </nav>
        </div>
      </header>

      <div className='mx-auto max-w-7xl px-4 py-16 sm:px-8'>
        <section className='gb-hero relative overflow-hidden rounded-3xl px-6 py-10 sm:px-10'>
          <div
            className='gb-hero-media opacity-30'
            style={{ backgroundImage: `url("https://images.unsplash.com/photo-1503376780353-7e6692761b02?auto=format&fit=crop&w=1800&q=80")` }}
          />
          <div className='gb-hero-scrim' />
          <div className='gb-hero-content relative z-10'>
            <p className='gb-eyebrow'>Transformation portfolio</p>
            <h1 className='gb-section-title mt-3'>Before &amp; after transformations</h1>
            <p className='mt-4 max-w-2xl text-sm text-zinc-300'>
              Real Gloss Boss results — tap any image for full-screen. Titles are curated in CMS (never raw filenames).
            </p>
          </div>
        </section>
        <div className='mt-12'>
          <PublicGalleryPortfolio />
        </div>
        <div className='mt-12 text-center'>
          <Link href='/book' className='gb-button-primary inline-flex'>
            Book your transformation
          </Link>
        </div>
      </div>

      <MarketingSiteFooter />
    </main>
  );
}