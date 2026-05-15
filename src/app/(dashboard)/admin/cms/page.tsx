import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { addGalleryImageAction, deleteGalleryImageAction, reorderGalleryImageAction, saveFeaturedShowcaseAction } from '@/app/(dashboard)/admin/gallery-messages-actions';
import { GalleryLocalUpload } from '@/components/admin/gallery-local-upload';
import { GalleryDragReorder } from '@/components/admin/gallery-drag-reorder';
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
  try {
    const logoRes = await supabase.from('site_settings').select('value').eq('key', 'navbar_logo').maybeSingle();
    if (!logoRes.error && typeof logoRes.data?.value === 'string') navbarLogoUrl = logoRes.data.value.trim();
    const homeLogoRes = await supabase.from('site_settings').select('value').eq('key', 'homepage_logo').maybeSingle();
    if (!homeLogoRes.error && typeof homeLogoRes.data?.value === 'string') homepageLogoUrl = homeLogoRes.data.value.trim();
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

  const galleryDragItems = galleryRows.map((r) => ({
    id: r.id,
    caption: r.caption,
    url: r.url?.trim() || r.image_url,
    sort_order: r.sort_order,
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
      </section>

      <section className='mb-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <h2 className='text-lg font-bold uppercase'>CMS documents</h2>
        <p className='mt-2 text-sm text-zinc-400'>Liability forms, SOPs, and homepage banners (paste public Storage URLs or upload via Gallery).</p>
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
        <form action={saveFeaturedShowcaseAction} className='mt-4 space-y-3'>
          <textarea
            name='json'
            rows={12}
            defaultValue={featuredJson}
            className='w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
            spellCheck={false}
          />
          <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
            Save featured showcase
          </button>
        </form>
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

        <GalleryDragReorder rows={galleryDragItems} />

        <ul className='mt-6 space-y-2 text-sm text-zinc-200'>
          {galleryRows.length === 0 ? <li className='text-zinc-500'>No gallery rows yet.</li> : null}
          {galleryRows.map((row, idx) => (
            <li key={row.id} className='flex flex-col gap-2 rounded-lg border border-white/10 bg-black/40 p-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='min-w-0 flex-1'>
                <span className='text-xs text-zinc-500'>
                  {row.published ? 'Published' : 'Draft'} · order {row.order_index ?? row.sort_order}
                </span>
                <p className='mt-1 break-all text-gold-soft'>{row.url?.trim() || row.image_url}</p>
                {row.caption ? <p className='mt-1 text-zinc-400'>{row.caption}</p> : null}
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <form action={reorderGalleryImageAction}>
                  <input type='hidden' name='id' value={row.id} />
                  <input type='hidden' name='direction' value='up' />
                  <button
                    type='submit'
                    disabled={idx === 0}
                    className='rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-gold/40 disabled:opacity-30'
                  >
                    Up
                  </button>
                </form>
                <form action={reorderGalleryImageAction}>
                  <input type='hidden' name='id' value={row.id} />
                  <input type='hidden' name='direction' value='down' />
                  <button
                    type='submit'
                    disabled={idx >= galleryRows.length - 1}
                    className='rounded-lg border border-white/15 px-2 py-1 text-xs text-zinc-300 hover:border-gold/40 disabled:opacity-30'
                  >
                    Down
                  </button>
                </form>
                <form action={deleteGalleryImageAction}>
                  <input type='hidden' name='id' value={row.id} />
                  <button type='submit' className='rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-300 hover:bg-red-500/10'>
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
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
