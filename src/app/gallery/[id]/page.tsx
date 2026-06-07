import Link from 'next/link';
import { notFound } from 'next/navigation';
import { tryCreateRoutePublicSupabase, tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { normalizeGalleryRowPublic } from '@/lib/gallery-normalize';
import { GalleryDetailClient } from '@/components/marketing/gallery-detail-client';
import { MarketingSiteFooter } from '@/components/marketing/marketing-site-footer';

// Safe query helper for job work order photos
async function fetchTechPhotos(supabase: any, jobId: string) {
  const photos: { id: string; url: string; category: string }[] = [];
  const tables = ['job_photos', 'job_media'] as const;

  for (const table of tables) {
    try {
      // 1. Query by appointment_id
      const { data: byAppt, error: errAppt } = await supabase
        .from(table)
        .select('*')
        .eq('appointment_id', jobId);
      
      if (!errAppt && byAppt) {
        for (const row of byAppt) {
          if (row.visible_to_customer === false) continue;
          const url = row.public_url || row.media_url || row.file_url || row.url;
          if (url) {
            photos.push({
              id: row.id || url,
              url,
              category: row.category || row.photo_category || '',
            });
          }
        }
      }
    } catch (e) {
      console.warn(`[tech-photos-fetch] Failed to fetch ${table} by appointment_id:`, e);
    }

    try {
      // 2. Query by fallback_booking_id
      const { data: byFallback, error: errFallback } = await supabase
        .from(table)
        .select('*')
        .eq('fallback_booking_id', jobId);

      if (!errFallback && byFallback) {
        for (const row of byFallback) {
          if (row.visible_to_customer === false) continue;
          const url = row.public_url || row.media_url || row.file_url || row.url;
          if (url) {
            photos.push({
              id: row.id || url,
              url,
              category: row.category || row.photo_category || '',
            });
          }
        }
      }
    } catch (e) {
      // column fallback_booking_id might not exist in this table, fail silently
    }
  }

  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqPhotos: { id: string; url: string; category: string }[] = [];
  for (const p of photos) {
    if (!seenUrls.has(p.url)) {
      seenUrls.add(p.url);
      uniqPhotos.push(p);
    }
  }
  return uniqPhotos;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = tryCreateRoutePublicSupabase() ?? tryCreateAdminSupabase();
  if (!supabase) return { title: 'Transformation Detail | Gloss Boss ATX' };

  const { data: rawRow } = await supabase
    .from('gallery_images')
    .select('*')
    .eq('id', resolvedParams.id)
    .maybeSingle();

  const item = rawRow ? normalizeGalleryRowPublic(rawRow) : null;
  if (!item) {
    return {
      title: 'Transformation Detail | Gloss Boss ATX',
    };
  }

  const title = item.caption || item.vehicleLabel || 'Transformation Detail';
  const description = item.serviceLabel
    ? `${title} - Completed detailing work order featuring our ${item.serviceLabel} package.`
    : `${title} - Completed detailing work order transformation.`;

  return {
    title: `${title} | Gloss Boss ATX`,
    description,
  };
}

export default async function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = tryCreateRoutePublicSupabase() ?? tryCreateAdminSupabase();
  if (!supabase) {
    notFound();
  }

  // Fetch the gallery image by ID
  const { data: rawRow, error } = await supabase
    .from('gallery_images')
    .select('*')
    .eq('id', resolvedParams.id)
    .maybeSingle();

  if (error || !rawRow) {
    notFound();
  }

  const item = normalizeGalleryRowPublic(rawRow);
  if (!item) {
    notFound();
  }

  // Fetch technician work order photos if job_id is present
  const techPhotos = item.jobId ? await fetchTechPhotos(supabase, item.jobId) : [];

  return (
    <main className="gb-luxury-page min-h-screen bg-background text-foreground">
      <header className="border-b border-gold/20 bg-black/80 px-4 py-6 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link href="/" className="text-xs font-black uppercase tracking-[0.25em] text-gold-soft">
            Gloss Boss ATX
          </Link>
          <nav className="flex gap-4 text-xs font-bold uppercase">
            <Link href="/services" className="text-zinc-400 hover:text-gold-soft">
              Services
            </Link>
            <Link href="/gallery" className="text-zinc-400 hover:text-gold-soft">
              Gallery
            </Link>
            <Link href="/book" className="rounded-lg bg-gold px-4 py-2 text-black">
              Book
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-8">
        <GalleryDetailClient item={item} techPhotos={techPhotos} />
      </div>

      <MarketingSiteFooter />
    </main>
  );
}
