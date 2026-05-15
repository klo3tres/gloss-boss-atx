'use client';

import Link from 'next/link';
import { HomeGalleryStrip } from '@/components/marketing/home-gallery-strip';

export default function GalleryPage() {
  return (
    <main className='min-h-screen bg-background pb-20 pt-24 text-foreground'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <p className='text-xs font-bold uppercase tracking-[0.25em] text-gold-soft'>Gallery</p>
        <h1 className='mt-2 text-3xl font-black uppercase tracking-tight text-white sm:text-4xl'>Featured transformations</h1>
        <p className='mt-3 max-w-2xl text-sm text-zinc-400'>
          Curated and CMS-driven imagery. For the full homepage experience, visit the{' '}
          <Link href='/#gallery' className='text-gold-soft underline'>
            home gallery section
          </Link>
          .
        </p>
        <div className='mt-10'>
          <HomeGalleryStrip />
        </div>
        <div className='mt-12 flex flex-wrap gap-3'>
          <Link href='/book' className='rounded-lg bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black'>
            Book now
          </Link>
          <Link href='/' className='rounded-lg border border-gold/40 px-5 py-3 text-xs font-bold uppercase tracking-wider text-gold-soft'>
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
