import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type Doc = { id: string; category: string; title: string; file_url: string; mime_type: string | null };

const CATEGORY_LABELS: Record<string, string> = {
  liability: 'Agreements & waivers',
  sop: 'SOPs & standards',
  homepage_banner: 'Reference',
  other: 'Training & other',
};

export default async function TechResourcesPage() {
  const session = await getSessionWithProfile();
  let docs: Doc[] = [];

  try {
    const admin = tryCreateAdminSupabase();
    if (admin) {
      const { data } = await admin.from('cms_documents').select('*').order('sort_order', { ascending: true });
      docs = (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        category: String(r.category ?? 'other'),
        title: String(r.title ?? 'Document'),
        file_url: String(r.file_url ?? ''),
        mime_type: typeof r.mime_type === 'string' ? r.mime_type : null,
      }));
    }
  } catch {
    docs = [];
  }

  const grouped = new Map<string, Doc[]>();
  for (const d of docs) {
    const key = d.category in CATEGORY_LABELS ? d.category : 'other';
    const list = grouped.get(key) ?? [];
    list.push(d);
    grouped.set(key, list);
  }

  return (
    <DashboardShell title='Technician resources' subtitle='SOPs, agreements, and training from admin CMS.' role='technician'>
      <Link href='/tech' className='mb-4 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Back to field terminal
      </Link>

      {docs.length === 0 ? (
        <p className='rounded-2xl border border-white/10 bg-zinc-950 p-6 text-sm text-zinc-400'>
          No documents uploaded yet. Admin can add files under CMS → Documents & SOPs.
        </p>
      ) : null}

      <div className='space-y-6'>
        {[...grouped.entries()].map(([cat, items]) => (
          <section key={cat} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
            <h2 className='text-sm font-bold uppercase tracking-wider text-gold-soft'>{CATEGORY_LABELS[cat] ?? cat}</h2>
            <ul className='mt-4 space-y-2'>
              {items.map((d) => (
                <li key={d.id} className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2'>
                  <span className='text-sm text-white'>{d.title}</span>
                  <a
                    href={d.file_url}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='rounded border border-gold/40 px-3 py-1 text-xs font-bold uppercase text-gold-soft hover:bg-gold/10'
                  >
                    Open
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DashboardShell>
  );
}
