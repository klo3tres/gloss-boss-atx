import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { addGalleryImageAction } from '@/app/(dashboard)/admin/gallery-messages-actions';
import { parseBookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { DEFAULT_BOOKING_AVAILABILITY } from '@/lib/booking-availability';
import { CmsDocumentDropzone } from '@/components/admin/cms-document-dropzone';
import { CmsDocumentDeleteButton } from '@/components/admin/cms-document-delete-button';
import { CmsDocumentManualForm } from '@/components/admin/cms-document-manual-form';
import { CmsBookingAvailabilityClient } from '@/components/admin/cms-booking-availability-client';
import { PromotionsAdminClient } from '@/components/admin/promotions-admin-client';
import { parsePromotionAdminRow } from '@/lib/promotion-admin';
import { CmsGoogleReviewClient } from '@/components/admin/cms-google-review-client';
import { BrandingUploadDropzone } from '@/components/admin/branding-upload-dropzone';
import { GalleryLocalUpload } from '@/components/admin/gallery-local-upload';
import { GalleryAdminManager } from '@/components/admin/gallery-admin-manager';
import { FeaturedShowcaseManager } from '@/components/admin/featured-showcase-manager';
import { defaultFeaturedShowcaseSlides } from '@/lib/public-site-data';
import { mapAdminGalleryRows, type AdminGalleryRow } from '@/lib/gallery-normalize';
import { submitHomepageLogoForm, submitNavbarLogoForm } from '@/lib/admin/site-branding-actions';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { WorkOrderUploadsTab } from '@/components/admin/work-order-uploads-tab';

export const dynamic = 'force-dynamic';

export default async function AdminCmsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSessionWithProfile();
  const sp = await searchParams;
  const logoOk = typeof sp.logoOk === 'string' ? sp.logoOk : Array.isArray(sp.logoOk) ? sp.logoOk[0] : undefined;
  const logoErrRaw = typeof sp.logoErr === 'string' ? sp.logoErr : Array.isArray(sp.logoErr) ? sp.logoErr[0] : undefined;
  const logoErr = logoErrRaw ? decodeURIComponent(logoErrRaw) : null;
  const docOk = typeof sp.docOk === 'string';
  const docErrRaw = typeof sp.docErr === 'string' ? sp.docErr : undefined;
  const offerOk = typeof sp.offerOk === 'string';
  const offerErrRaw = typeof sp.offerErr === 'string' ? sp.offerErr : undefined;
  const availOk = typeof sp.availOk === 'string';
  const availErrRaw = typeof sp.availErr === 'string' ? sp.availErr : undefined;

  if (!session.supabaseConfigured) {
    return (
      <DashboardShell title='Site content' subtitle='Server configuration required.' role='admin'>
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100'>
          Add Supabase keys to load CMS data. See <Link href='/setup' className='text-gold-soft underline'>setup</Link>.
        </p>
      </DashboardShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <DashboardShell title='Site content' subtitle='Could not open server session.' role='admin'>
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100'>Supabase server client unavailable. Check cookies and environment.</p>
      </DashboardShell>
    );
  }

  const galleryRes = await supabase.from('gallery_images').select('*').order('sort_order', { ascending: true });
  const offersRes = await supabase.from('offers').select('*').order('sort_order', { ascending: true });
  const homepageRes = await supabase.from('homepage_content').select('*').order('key', { ascending: true });

  type GalleryRow = AdminGalleryRow;
  type HomeRow = { id: string; key: string; value: unknown; updated_at: string };

  const galleryRows: GalleryRow[] = galleryRes.error ? [] : mapAdminGalleryRows(galleryRes.data ?? []);
  const gErr = galleryRes.error && galleryRows.length === 0 ? galleryRes.error : null;

  const promotionRows = !offersRes.error
    ? (offersRes.data ?? []).map((r) => parsePromotionAdminRow(r as Record<string, unknown>))
    : [];
  const oErr = offersRes.error && promotionRows.length === 0 ? offersRes.error : null;

  const homeRows: HomeRow[] = !homepageRes.error
    ? ((homepageRes.data ?? []) as HomeRow[])
    : [];
  const hErr = homepageRes.error && homeRows.length === 0 ? homepageRes.error : null;

  const featuredRow = homeRows.find((r) => r.key === 'featured_showcase');
  const featuredJson =
    featuredRow?.value != null && typeof featuredRow.value === 'object'
      ? JSON.stringify(featuredRow.value, null, 2)
      : JSON.stringify({ slides: defaultFeaturedShowcaseSlides() }, null, 2);

  let navbarLogoUrl = '';
  let homepageLogoUrl = '';
  let bookingAvail = parseBookingAvailabilityConfig(DEFAULT_BOOKING_AVAILABILITY);
  try {
    const settingsRes = await supabase.from('site_settings').select('key, value').in('key', ['navbar_logo', 'homepage_logo', 'booking_availability']);
    for (const row of settingsRes.data ?? []) {
      const key = typeof row?.key === 'string' ? row.key : '';
      const val = typeof row?.value === 'string' ? row.value.trim() : '';
      if (key === 'navbar_logo' && val) navbarLogoUrl = val;
      if (key === 'homepage_logo' && val) homepageLogoUrl = val;
      if (key === 'booking_availability' && val) {
        try {
          bookingAvail = parseBookingAvailabilityConfig(JSON.parse(val));
        } catch {
          /* keep default */
        }
      }
    }
  } catch {
    /* site_settings may be missing */
  }

  let cmsDocs: { id: string; category: string; title: string; file_url: string; sort_order: number; jsxTemplate?: boolean }[] = [];
  try {
    const admin = tryCreateAdminSupabase();
    const docRes = admin
      ? await admin.from('cms_documents').select('*').order('sort_order', { ascending: true })
      : { data: null, error: { message: 'no admin' } };
    if (!docRes.error && docRes.data) {
      cmsDocs = (docRes.data as Record<string, unknown>[]).map((r) => {
        const meta = r.meta && typeof r.meta === 'object' && r.meta !== null ? (r.meta as Record<string, unknown>) : null;
        const jsxTemplate = Boolean(meta?.jsx_template_reference);
        return {
          id: String(r.id),
          category: String(r.category ?? 'other'),
          title: String(r.title ?? ''),
          file_url: String(r.file_url ?? ''),
          sort_order: Number(r.sort_order ?? 0),
          jsxTemplate,
        };
      });
    }
  } catch {
    cmsDocs = [];
  }

  let googleReviewUrl = '';
  try {
    const admReview = tryCreateAdminSupabase();
    if (admReview) {
      const rv = await admReview.from('review_settings').select('value').eq('key', 'google_business').maybeSingle();
      const raw = rv.data?.value;
      if (raw && typeof raw === 'object' && raw !== null && 'review_url' in raw) {
        const u = (raw as { review_url?: unknown }).review_url;
        if (typeof u === 'string') googleReviewUrl = u.trim();
      }
      if (!googleReviewUrl) {
        const ss = await admReview.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle();
        const s = ss.data?.value != null ? String(ss.data.value).trim() : '';
        if (s.startsWith('http')) googleReviewUrl = s;
        else if (s) {
          try {
            const o = JSON.parse(s) as { url?: string };
            if (typeof o?.url === 'string') googleReviewUrl = o.url.trim();
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    googleReviewUrl = '';
  }

  const galleryAdminItems = galleryRows.map((r) => ({
    id: r.id,
    caption: r.caption,
    url: r.url?.trim() || r.image_url,
    sort_order: r.order_index ?? r.sort_order,
    published: r.published,
    featured: r.featured,
    watermark: r.watermark,
    vehicleLabel: r.vehicleLabel,
    serviceLabel: r.serviceLabel,
    transformationPhase: r.transformationPhase,
  }));

  let recentPhotos: any[] = [];
  try {
    const { data: pRes } = await supabase
      .from('job_photos')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    recentPhotos = pRes || [];
  } catch (err) {
    console.error('Failed to fetch recent job photos', err);
  }

  const currentTab = typeof sp.tab === 'string' ? sp.tab : 'gallery';

  return (
    <DashboardShell
      title='Site content'
      subtitle='Gallery, offers, and homepage content — wired to Supabase CMS tables.'
      role='admin'
    >
      {gErr ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Gallery query failed: {gErr.message}. Apply <code className='text-gold-soft'>supabase/migrations/000002_cms_job_times_signature.sql</code> in the Supabase SQL editor.
        </p>
      ) : null}

      {logoOk ? (
        <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100' role='status'>
          Navbar logo saved. Public site will pick it up within a minute (CDN cache).
        </p>
      ) : null}
      {logoErr ? (
        <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100' role='alert'>
          {logoErr}
        </p>
      ) : null}
      {docOk ? <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100'>Document saved.</p> : null}
      {docErrRaw ? <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100'>{decodeURIComponent(docErrRaw)}</p> : null}
      {offerOk ? <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100'>Offer saved.</p> : null}
      {offerErrRaw ? <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100'>{decodeURIComponent(offerErrRaw)}</p> : null}
      {availOk ? <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100'>Booking availability saved.</p> : null}
      {availErrRaw ? <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100'>{decodeURIComponent(availErrRaw)}</p> : null}

      <p className='mb-6 flex flex-wrap gap-4 text-sm text-zinc-400'>
        <Link href='/admin/agreements' className='font-bold text-gold-soft underline'>
          Signed agreements →
        </Link>
        <Link href='/admin/intake' className='font-bold text-gold-soft underline'>
          Intake submissions →
        </Link>
      </p>

      {/* Tabs Selector */}
      <div className="flex overflow-x-auto gap-1 border-b border-white/10 pb-1 mb-6">
        {[
          { id: 'gallery', label: 'Gallery CMS' },
          { id: 'uploads', label: 'Work Order Photos' },
          { id: 'hours', label: 'Hours & Settings' },
          { id: 'documents', label: 'Documents' },
          { id: 'featured', label: 'Featured Transformations' },
          { id: 'promotions', label: 'Promotions' },
        ].map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/admin/cms?tab=${tab.id}`}
              className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition duration-200 whitespace-nowrap border ${
                isActive
                  ? 'border-gold bg-gold/10 text-gold-soft'
                  : 'border-transparent text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Tab Contents */}
      {currentTab === 'gallery' && (
        <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>Gallery images</h2>
          <p className='mt-2 text-sm text-zinc-400'>Add public image URLs (Cloudinary, Supabase Storage, etc.). Homepage pulls published images automatically.</p>

          <GalleryLocalUpload />

          <form action={addGalleryImageAction} className='mt-6 grid gap-3 rounded-xl border border-gold/15 bg-black/40 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end'>
            <label className='block text-xs text-zinc-400 sm:col-span-1'>
              Image URL
              <input name='image_url' required placeholder='https://…' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='block text-xs text-zinc-400 sm:col-span-1'>
              Caption (optional)
              <input name='caption' placeholder='Short label' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <button type='submit' className='rounded-lg bg-gradient-to-r from-gold via-gold-soft to-gold px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:brightness-110 transition duration-150'>
              Publish
            </button>
          </form>

          <GalleryAdminManager rows={galleryAdminItems} />
        </section>
      )}

      {currentTab === 'uploads' && (
        <WorkOrderUploadsTab recentPhotos={recentPhotos} />
      )}

      {currentTab === 'hours' && (
        <>
          <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
            <h2 className='text-lg font-black uppercase tracking-tight text-white'>Online booking hours</h2>
            <p className='mt-2 text-sm text-zinc-400'>Friday 5:00–9:00 PM, Saturday & Sunday 7:30 AM–7:00 PM (defaults). Add blackout dates below.</p>
            <CmsBookingAvailabilityClient initial={bookingAvail} />
          </section>

          <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
            <h2 className='text-lg font-black uppercase tracking-tight text-white'>Google review link</h2>
            <p className='mt-2 text-sm text-zinc-400'>Powers the “Leave us a Google Review” button on the homepage. Paste your public review URL.</p>
            {!googleReviewUrl ? (
              <p className='mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100' role='alert'>
                No Google review URL saved — customers will not see the gold “Leave Google Review” button until you add a link here.
              </p>
            ) : null}
            <CmsGoogleReviewClient initialUrl={googleReviewUrl} />
          </section>

          <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
            <h2 className='text-lg font-black uppercase tracking-tight text-white'>Navbar logo</h2>
            <p className='mt-2 text-sm text-zinc-400'>
              Paste a public HTTPS URL (for example from Supabase Storage after upload). Falls back to <code className='text-gold-soft'>/brand/glossboss-official-atx.png</code> when empty.
            </p>
            <form action={submitNavbarLogoForm} className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-end'>
              <label className='block min-w-0 flex-1 text-xs text-zinc-400'>
                Logo URL
                <input
                  name='navbar_logo_url'
                  type='url'
                  defaultValue={navbarLogoUrl}
                  placeholder='https://…'
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <button type='submit' className='rounded-lg bg-gradient-to-r from-gold via-gold-soft to-gold px-4 py-2.5 text-xs font-black uppercase tracking-wider text-black hover:brightness-110 transition duration-150'>
                Save navbar logo
              </button>
            </form>
            <div className='mt-4'>
              <BrandingUploadDropzone settingKey='navbar_logo' label='Or upload navbar logo' />
            </div>
          </section>

          <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
            <h2 className='text-lg font-black uppercase tracking-tight text-white'>Homepage logo</h2>
            <form action={submitHomepageLogoForm} className='mt-4 flex flex-col gap-3 sm:flex-row sm:items-end'>
              <label className='block min-w-0 flex-1 text-xs text-zinc-400'>
                Homepage hero logo URL
                <input
                  name='homepage_logo_url'
                  type='url'
                  defaultValue={homepageLogoUrl}
                  placeholder='https://…'
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <button type='submit' className='rounded-lg border border-gold/40 bg-gold/5 px-4 py-2.5 text-xs font-black uppercase text-gold-soft hover:bg-gold/15 transition duration-150'>
                Save homepage logo
              </button>
            </form>
            <div className='mt-4'>
              <BrandingUploadDropzone settingKey='homepage_logo' label='Or upload homepage logo' />
            </div>
          </section>

          <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
            <h2 className='text-lg font-black uppercase tracking-tight text-white'>Homepage content keys</h2>
            {hErr ? <p className='text-sm text-red-300'>{hErr.message}</p> : null}
            <ul className='mt-4 space-y-2 font-mono text-xs text-zinc-300'>
              {homeRows.map((row) => (
                <li key={row.id} className='rounded border border-white/10 bg-black/40 p-2'>
                  {row.key} <span className='text-zinc-600'>·</span> {JSON.stringify(row.value)}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {currentTab === 'documents' && (
        <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>CMS documents</h2>
          <p className='mt-2 text-sm text-zinc-400'>
            Drag & drop uploads save automatically to Supabase Storage and the document list (PDF, images, HTML, JSX/TSX as a non-executed template reference). Word (.doc/.docx): convert to PDF first.
          </p>
          <div className='mt-4 grid gap-4 sm:grid-cols-2'>
            <CmsDocumentDropzone category='liability' label='Liability & waivers' />
            <CmsDocumentDropzone category='sop' label='SOPs' />
            <CmsDocumentDropzone category='intake' label='Intake form (HTML)' />
            <CmsDocumentDropzone category='other' label='Training & other' />
          </div>
          <CmsDocumentManualForm />
          <ul className='mt-4 space-y-2 text-sm'>
            {cmsDocs.length === 0 ? <li className='text-zinc-500 italic'>No documents yet (run migration 000014).</li> : null}
            {cmsDocs.map((d) => (
              <li key={d.id} className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
                <span>
                  <span className='text-gold-soft font-bold'>{d.category}</span> — {d.title}
                  {d.jsxTemplate ? (
                    <span className='mt-1 block text-[11px] font-medium text-amber-200/95'>
                      JSX uploaded as template reference. Use the generated intake form for live signing — we never execute uploaded JSX in the browser.
                    </span>
                  ) : null}
                  <span className='ml-2 block truncate text-xs text-zinc-500 font-mono'>{d.file_url}</span>
                </span>
                <CmsDocumentDeleteButton id={d.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {currentTab === 'featured' && (
        <section className='mb-6 gb-premium-card rounded-2xl border border-gold/15 p-6 backdrop-blur shadow-md'>
          <h2 className='text-lg font-black uppercase tracking-tight text-white'>Homepage featured transformations</h2>
          <p className='mt-2 text-sm text-zinc-400'>
            Controls the Before/After preview on the homepage. Use JSON: <code className='text-gold-soft'>{`{ "slides": [ { "id": "1", "label": "…", "image": "https://…" } ] }`}</code>
          </p>
          <FeaturedShowcaseManager initialJson={featuredJson} />
        </section>
      )}

      {currentTab === 'promotions' && (
        <>
          {oErr ? <p className='mb-4 text-sm text-red-300'>{oErr.message}</p> : null}
          <PromotionsAdminClient initialRows={promotionRows} />
        </>
      )}

      <Link href='/admin' className='inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline mt-4'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
