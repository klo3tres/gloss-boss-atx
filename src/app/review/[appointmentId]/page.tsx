import Image from 'next/image';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

const LOGO = '/brand/glossboss-official-atx.png';

function text(v: unknown) {
  return typeof v === 'string' ? v : '';
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ appointmentId: string }>;
  searchParams: Promise<{ submitted?: string; error?: string }>;
}) {
  const { appointmentId } = await params;
  const qs = await searchParams;
  const admin = tryCreateAdminSupabase();
  const [{ data: appointment }, { data: settings }, { data: media }] = admin
    ? await Promise.all([
        admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle(),
        admin.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle(),
        admin
          .from('job_media')
          .select('file_url, category, visible_to_customer')
          .eq('appointment_id', appointmentId)
          .order('created_at', { ascending: true }),
      ])
    : [{ data: null }, { data: null }, { data: [] }];

  const rawGoogle = (settings as { value?: unknown } | null)?.value;
  const googleReviewUrl =
    typeof rawGoogle === 'string'
      ? rawGoogle
      : rawGoogle && typeof rawGoogle === 'object'
        ? text((rawGoogle as Record<string, unknown>).review_url)
        : '';
  const photos = ((media ?? []) as Array<{ file_url?: string; category?: string; visible_to_customer?: boolean }>)
    .filter((p) => p.visible_to_customer !== false && p.file_url)
    .slice(0, 8);
  const service = text((appointment as Record<string, unknown> | null)?.service_slug).replace(/-/g, ' ') || 'Completed detail';
  const vehicle = text((appointment as Record<string, unknown> | null)?.vehicle_description) || 'your vehicle';

  return (
    <main className='gb-luxury-page min-h-screen bg-background px-4 py-24 text-foreground'>
      <section className='mx-auto max-w-3xl rounded-3xl border border-gold/25 bg-black/70 p-6 shadow-[0_0_55px_rgba(212,175,55,0.12)] sm:p-8'>
        <Image src={LOGO} alt='Gloss Boss ATX' width={220} height={140} className='mx-auto h-auto w-40 object-contain' priority />
        <p className='mt-6 text-center text-xs font-black uppercase tracking-[0.28em] text-gold-soft'>Service review</p>
        <h1 className='mt-3 text-center text-3xl font-black uppercase tracking-tight text-white sm:text-5xl'>How did we do?</h1>
        <p className='mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-zinc-300'>
          Review your completed {service} for {vehicle}. Your testimonial stays private until Gloss Boss ATX approves it.
        </p>

        {photos.length > 0 ? (
          <div className='mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4'>
            {photos.map((photo) => (
              <a key={photo.file_url} href={photo.file_url} target='_blank' rel='noreferrer' className='group relative aspect-square overflow-hidden rounded-2xl border border-white/10'>
                <img src={photo.file_url} alt='' className='h-full w-full object-cover transition duration-500 group-hover:scale-105' />
                <span className='absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[9px] font-black uppercase text-gold-soft'>
                  {photo.category || 'photo'}
                </span>
              </a>
            ))}
          </div>
        ) : null}

        {qs.submitted ? (
          <p className='mt-6 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-center text-sm font-bold text-emerald-100'>
            Thank you. Your testimonial was sent to Gloss Boss ATX for review.
          </p>
        ) : null}
        {qs.error ? (
          <p className='mt-6 rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-center text-sm font-bold text-red-100'>
            Something went wrong sending your testimonial. Please try again.
          </p>
        ) : null}

        <form action='/api/reviews' method='post' className='mt-7 space-y-4'>
          <input type='hidden' name='appointmentId' value={appointmentId} />
          <label className='block text-xs font-black uppercase tracking-wider text-zinc-400'>
            Rating
            <select name='rating' defaultValue='5' className='mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-white'>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n} stars</option>
              ))}
            </select>
          </label>
          <label className='block text-xs font-black uppercase tracking-wider text-zinc-400'>
            Testimonial
            <textarea name='testimonial' rows={5} required placeholder='Tell us what stood out...' className='mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white' />
          </label>
          <button type='submit' className='w-full rounded-xl bg-gold px-5 py-4 text-xs font-black uppercase tracking-wider text-black'>Send testimonial</button>
        </form>

        {googleReviewUrl ? (
          <Link href={googleReviewUrl} target='_blank' className='mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gold/35 px-5 py-4 text-xs font-black uppercase tracking-wider text-gold-soft'>
            <Star className='h-4 w-4' /> Leave Google review
          </Link>
        ) : null}
      </section>
    </main>
  );
}
