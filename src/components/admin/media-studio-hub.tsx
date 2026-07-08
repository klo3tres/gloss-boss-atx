'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { MediaStudioClient } from '@/components/admin/media-studio-client';
import { CmsMediaManager } from '@/components/admin/cms-media-manager';
import { GalleryAdminManager, type GalleryAdminItem } from '@/components/admin/gallery-admin-manager';
import type { MediaAsset } from '@/lib/media-studio';
import type { MediaRegistry } from '@/lib/media-registry';

const TABS = [
  { id: 'assets', label: 'Asset library' },
  { id: 'registry', label: 'Vehicle & service images' },
  { id: 'gallery', label: 'Website gallery' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function MediaStudioHub({
  initialItems,
  tablesReady,
  registry,
  galleryRows,
}: {
  initialItems: MediaAsset[];
  tablesReady: boolean;
  registry: MediaRegistry;
  galleryRows: GalleryAdminItem[];
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'assets';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-white/10 pb-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <Link
              key={t.id}
              href={`/admin/media-studio?tab=${t.id}`}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                active ? 'border border-gold/30 bg-gold/10 text-gold-soft' : 'border border-transparent text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === 'assets' ? <MediaStudioClient initialItems={initialItems} tablesReady={tablesReady} /> : null}
      {tab === 'registry' ? (
        <section>
          <p className="mb-4 text-xs text-zinc-500">Booking wizard, service cards, fleet pages, memberships, and gift card images — file upload first.</p>
          <CmsMediaManager registry={registry} />
        </section>
      ) : null}
      {tab === 'gallery' ? (
        <section>
          <p className="mb-4 text-xs text-zinc-500">Public homepage gallery — publish, feature, and reorder before/after shots.</p>
          <GalleryAdminManager rows={galleryRows} />
        </section>
      ) : null}
    </div>
  );
}
