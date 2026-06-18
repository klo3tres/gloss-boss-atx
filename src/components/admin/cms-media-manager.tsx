import Image from 'next/image';
import { saveMediaRegistryAction } from '@/lib/admin/cms-media-actions';
import { MEDIA_REGISTRY_ITEMS, type MediaRegistry, mediaUrl } from '@/lib/media-registry';

export function CmsMediaManager({ registry }: { registry: MediaRegistry }) {
  const groups = Array.from(new Set(MEDIA_REGISTRY_ITEMS.map((item) => item.group)));

  return (
    <form action={saveMediaRegistryAction} className="space-y-6">
      <div className="rounded-3xl border border-gold/20 bg-black/45 p-5">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Central Media Manager</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-white">Every public image has an owner</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Replace hero, service, fleet, booking, gift card, membership, technician, promotional, and loyalty imagery from one control surface. Leave a field blank to use the production fallback.
        </p>
      </div>

      {groups.map((group) => (
        <section key={group} className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">{group}</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {MEDIA_REGISTRY_ITEMS.filter((item) => item.group === group).map((item) => {
              const url = mediaUrl(registry, item.key);
              return (
                <label key={item.key} className="grid gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 md:grid-cols-[140px_1fr]">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-black">
                    {url ? <Image src={url} alt={item.label} fill className="object-cover" unoptimized={url.startsWith('http')} /> : null}
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-gold-soft">{item.label}</span>
                    <p className="mt-1 text-xs text-zinc-500">{item.description}</p>
                    <input
                      name={item.key}
                      defaultValue={registry[item.key] ?? ''}
                      placeholder={item.fallbackUrl}
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-700 focus:border-gold/45"
                    />
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <button className="rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase tracking-[0.18em] text-black shadow-[0_0_24px_rgba(212,175,55,0.25)]">
        Save media registry
      </button>
    </form>
  );
}
