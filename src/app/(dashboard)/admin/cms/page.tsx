import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { addGalleryImageAction, saveFeaturedShowcaseAction } from '@/app/(dashboard)/admin/gallery-messages-actions';
import { saveBookingAvailabilityAction } from '@/lib/admin/booking-availability-actions';
import { parseBookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { DEFAULT_BOOKING_AVAILABILITY } from '@/lib/booking-availability';
import { CmsDocumentDropzone } from '@/components/admin/cms-document-dropzone';
import { BrandingUploadDropzone } from '@/components/admin/branding-upload-dropzone';
import { GalleryLocalUpload } from '@/components/admin/gallery-local-upload';
import { GalleryAdminManager } from '@/components/admin/gallery-admin-manager';
import { FeaturedShowcaseManager } from '@/components/admin/featured-showcase-manager';
import { defaultFeaturedShowcaseSlides } from '@/lib/public-site-data';
import { mapAdminGalleryRows, type AdminGalleryRow } from '@/lib/gallery-normalize';
import { deleteCmsDocumentAction, saveCmsDocumentUrlAction } from '@/lib/admin/cms-documents-actions';
import { upsertOfferAction } from '@/lib/admin/cms-offers-actions';
import { submitHomepageLogoForm, submitNavbarLogoForm } from '@/lib/admin/site-branding-actions';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

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
  type OfferRow = { id: string; label: string; percent_off: number | null; active: boolean; sort_order: number };
  type HomeRow = { id: string; key: string; value: unknown; updated_at: string };

  const galleryRows: GalleryRow[] = galleryRes.error ? [] : mapAdminGalleryRows(galleryRes.data ?? []);
  const gErr = galleryRes.error && galleryRows.length === 0 ? galleryRes.error : null;

  const offerRows: OfferRow[] = !offersRes.error
    ? (offersRes.data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        label: String(r.label ?? r.title ?? 'Offer'),
        percent_off:
          typeof r.percent_off === 'number'
            ? r.percent_off
            : typeof r.discount_percent === 'number'
              ? r.discount_percent
              : null,
        active: Boolean(r.active),
        sort_order: Number(r.sort_order ?? 0),
      }))
    : [];
  const oErr = offersRes.error && offerRows.length === 0 ? offersRes.error : null;

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

  let cmsDocs: { id: string; category: string; title: string; file_url: string; sort_order: number }[] = [];
  try {
    const admin = tryCreateAdminSupabase();
    const docRes = admin
      ? await admin.from('cms_documents').select('*').order('sort_order', { ascending: true })
      : { data: null, error: { message: 'no admin' } };
    if (!docRes.error && docRes.data) {
      cmsDocs = (docRes.data as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        category: String(r.category ?? 'other'),
        title: String(r.title ?? ''),
        file_url: String(r.file_url ?? ''),
        sort_order: Number(r.sort_order ?? 0),
      }));
    }
  } catch {
    cmsDocs = [];
  }

  const galleryAdminItems = galleryRows.map((r) => ({
    id: r.id,
    caption: r.caption,
    url: r.url?.trim() || r.image_url,
    sort_order: r.order_index ?? r.sort_order,
    published: r.published,
    featured: r.featured,
  }));

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

      <p className='mb-4 flex flex-wrap gap-4 text-sm text-zinc-400'>
        <Link href='/admin/agreements' className='font-bold text-gold-soft underline'>
          Signed agreements →
        </Link>
        <Link href='/admin/intake' className='font-bold text-gold-soft underline'>
          Intake submissions →
        </Link>
      </p>

      <section className='mb-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Online booking hours</h2>
        <p className='mt-2 text-sm text-zinc-400'>Default: Friday after 5pm, all day Saturday and Sunday. Add blackout dates (YYYY-MM-DD, one per line).</p>
        <form action={saveBookingAvailabilityAction} className='mt-4 space-y-4'>
          <label className='flex items-center gap-2 text-sm text-zinc-300'>
            <input type='checkbox' name='allowSaturday' defaultChecked={bookingAvail.allowSaturday} />
            Allow Saturday
          </label>
          <label className='flex items-center gap-2 text-sm text-zinc-300'>
            <input type='checkbox' name='allowSunday' defaultChecked={bookingAvail.allowSunday} />
            Allow Sunday
          </label>
          <label className='flex items-center gap-2 text-sm text-zinc-300'>
            <input type='checkbox' name='allowAllOtherDays' defaultChecked={bookingAvail.allowAllOtherDays} />
            Allow Mon–Thu and Fri before cutoff (override)
          </label>
          <label className='block text-xs text-zinc-400'>
            Friday — allow bookings after hour (24h, default 17 = 5pm)
            <input
              name='allowFridayAfterHour'
              type='number'
              min={0}
              max={23}
              defaultValue={bookingAvail.allowFridayAfterHour}
              className='mt-1 w-24 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            Blackout dates
            <textarea
              name='blackoutDates'
              rows={3}
              defaultValue={(bookingAvail.blackoutDates ?? []).join('\n')}
              placeholder='2026-12-25'
              className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
            />
          </label>
          <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
            Save booking rules
          </button>
        </form>
      </section>

      <section className='mb-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Navbar logo</h2>
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
          <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
            Save navbar logo
          </button>
        </form>
        <div className='mt-4'>
          <BrandingUploadDropzone settingKey='navbar_logo' label='Or upload navbar logo' />
        </div>
      </section>

      <section className='mb-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Homepage logo</h2>
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
          <button type='submit' className='rounded-lg border border-gold/40 px-4 py-2 text-xs font-bold uppercase text-gold-soft'>
            Save homepage logo
          </button>
        </form>
        <div className='mt-4'>
          <BrandingUploadDropzone settingKey='homepage_logo' label='Or upload homepage logo' />
        </div>
      </section>

      <section className='mb-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>CMS documents</h2>
        <p className='mt-2 text-sm text-zinc-400'>Upload PDFs and images for technicians and liability reference. URL paste still works below.</p>
        <div className='mt-4 grid gap-4 sm:grid-cols-2'>
          <CmsDocumentDropzone category='liability' label='Liability & waivers' />
          <CmsDocumentDropzone category='sop' label='SOPs' />
          <CmsDocumentDropzone category='intake' label='Intake form (HTML)' />
          <CmsDocumentDropzone category='other' label='Training & other' />
        </div>
        <form action={saveCmsDocumentUrlAction} className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <label className='block text-xs text-zinc-400'>
            Category
            <select name='category' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
              <option value='liability'>Liability</option>
              <option value='sop'>SOP</option>
              <option value='homepage_banner'>Homepage banner</option>
              <option value='other'>Other</option>
            </select>
          </label>
          <label className='block text-xs text-zinc-400'>
            Title
            <input name='title' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400 sm:col-span-2'>
            File URL (PDF or HTML)
            <input name='file_url' type='url' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black sm:col-span-2 lg:col-span-4 lg:justify-self-start'>
            Add document
          </button>
        </form>
        <ul className='mt-4 space-y-2 text-sm'>
          {cmsDocs.length === 0 ? <li className='text-zinc-500'>No documents yet (run migration 000014).</li> : null}
          {cmsDocs.map((d) => (
            <li key={d.id} className='flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 bg-black/40 px-3 py-2'>
              <span>
                <span className='text-gold-soft'>{d.category}</span> — {d.title}
                <span className='ml-2 block truncate text-xs text-zinc-500'>{d.file_url}</span>
              </span>
              <form action={deleteCmsDocumentAction}>
                <input type='hidden' name='id' value={d.id} />
                <button type='submit' className='text-xs text-red-300'>
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Homepage featured transformations</h2>
        <p className='mt-2 text-sm text-zinc-400'>
          Controls the Before/After preview on the homepage. Use JSON: <code className='text-gold-soft'>{`{ "slides": [ { "id": "1", "label": "…", "image": "https://…" } ] }`}</code>
        </p>
        <FeaturedShowcaseManager initialJson={featuredJson} saveAction={saveFeaturedShowcaseAction} />
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Gallery images</h2>
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
          <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
            Publish
          </button>
        </form>

        <GalleryAdminManager rows={galleryAdminItems} />
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Offers</h2>
        {oErr ? <p className='text-sm text-red-300'>{oErr.message}</p> : null}
        <form action={upsertOfferAction} className='mt-4 grid gap-3 rounded-xl border border-gold/15 bg-black/40 p-4 sm:grid-cols-2 lg:grid-cols-4'>
          <input type='hidden' name='id' value='' />
          <label className='block text-xs text-zinc-400 lg:col-span-2'>
            New offer title
            <input name='label' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400'>
            % off
            <input name='percent_off' type='number' min={0} max={100} defaultValue={15} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='flex items-end gap-2 text-xs text-zinc-400'>
            <input type='checkbox' name='active' defaultChecked className='rounded' />
            Active
          </label>
          <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black lg:col-span-4 lg:justify-self-start'>
            Create offer
          </button>
        </form>
        <ul className='mt-4 space-y-3 text-sm'>
          {offerRows.map((row) => (
            <li key={row.id} className='rounded-lg border border-white/10 bg-black/40 p-3'>
              <form action={upsertOfferAction} className='grid gap-2 sm:grid-cols-[1fr_80px_auto_auto] sm:items-end'>
                <input type='hidden' name='id' value={row.id} />
                <label className='text-xs text-zinc-400'>
                  Title
                  <input name='label' defaultValue={row.label} className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
                </label>
                <label className='text-xs text-zinc-400'>
                  %
                  <input name='percent_off' type='number' defaultValue={row.percent_off ?? 0} className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
                </label>
                <label className='flex items-center gap-2 text-xs text-zinc-400'>
                  <input type='checkbox' name='active' defaultChecked={row.active} />
                  Active
                </label>
                <button type='submit' className='rounded border border-gold/40 px-2 py-1 text-xs font-bold uppercase text-gold-soft'>
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>Homepage content keys</h2>
        {hErr ? <p className='text-sm text-red-300'>{hErr.message}</p> : null}
        <ul className='mt-4 space-y-2 font-mono text-xs text-zinc-300'>
          {homeRows.map((row) => (
            <li key={row.id} className='rounded border border-white/10 bg-black/40 p-2'>
              {row.key} <span className='text-zinc-600'>·</span> {JSON.stringify(row.value)}
            </li>
          ))}
        </ul>
      </section>

      <Link href='/admin' className='inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
