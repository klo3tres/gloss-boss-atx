'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  generateSocialReplyAction,
  logSocialOutcomeAction,
  saveSocialOutreachTargetAction,
  saveSocialPostAction,
} from '@/app/(dashboard)/admin/integrations/maps-integration-actions';

type OutreachTarget = { id: string; platform: string; label: string; url: string | null; keywords: string | null };
type SocialPost = {
  id: string;
  post_text: string;
  author_name: string | null;
  generated_reply: string | null;
  generated_dm: string | null;
  status: string;
  outcome: string | null;
};

export function SocialOutreachManualPanel({
  targets,
  posts,
}: {
  targets: OutreachTarget[];
  posts: SocialPost[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="rounded-3xl border border-pink-500/20 bg-black/55 p-6">
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-pink-300">Social Outreach — Manual Mode</p>
      <p className="mt-2 text-sm text-zinc-500">
        No Facebook or Instagram automation yet. Save groups/accounts, paste posts, generate reply/DM copy, and log outcomes manually.
      </p>

      <form
        className="mt-4 grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setErr(null);
          start(async () => {
            const res = await saveSocialOutreachTargetAction(fd);
            if (!res.ok) setErr(res.error ?? 'Save failed');
            else {
              e.currentTarget.reset();
              router.refresh();
            }
          });
        }}
      >
        <select name="platform" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white">
          <option value="facebook_group">Facebook group</option>
          <option value="instagram">Instagram account</option>
          <option value="nextdoor">Nextdoor</option>
          <option value="other">Other</option>
        </select>
        <input name="label" placeholder="Label (e.g. Austin Fleet Owners)" required className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        <input name="url" placeholder="Group or profile URL" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white sm:col-span-2" />
        <input name="keywords" placeholder="Keywords to watch (comma-separated)" className="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white sm:col-span-2" />
        <button type="submit" disabled={pending} className="rounded-xl bg-pink-500/20 border border-pink-500/40 px-4 py-2 text-[10px] font-black uppercase text-pink-200 sm:col-span-2 disabled:opacity-50">
          Save target
        </button>
      </form>

      {targets.length > 0 ? (
        <ul className="mt-4 space-y-2 text-xs text-zinc-400">
          {targets.map((t) => (
            <li key={t.id} className="rounded-xl border border-white/5 bg-black/40 px-3 py-2">
              <span className="font-bold text-white">{t.label}</span>
              <span className="text-zinc-600"> · {t.platform}</span>
              {t.url ? <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{t.url}</p> : null}
              {t.keywords ? <p className="text-[10px] text-zinc-600">Keywords: {t.keywords}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="mt-6 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setErr(null);
          start(async () => {
            const res = await saveSocialPostAction(fd);
            if (!res.ok) setErr(res.error ?? 'Save failed');
            else {
              e.currentTarget.reset();
              router.refresh();
            }
          });
        }}
      >
        <p className="text-[10px] font-black uppercase text-zinc-500">Paste post / comment</p>
        <textarea name="post_text" required rows={4} placeholder="Paste the post or comment you found…" className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        <input name="author_name" placeholder="Author (optional)" className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white" />
        <button type="submit" disabled={pending} className="rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50">
          Save post
        </button>
      </form>

      {posts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {posts.slice(0, 5).map((p) => (
            <li key={p.id} className="rounded-2xl border border-white/5 bg-black/40 p-4 text-xs">
              <p className="whitespace-pre-wrap text-zinc-300">{p.post_text}</p>
              {p.generated_reply ? (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <p className="text-[10px] font-black uppercase text-emerald-400">Suggested reply</p>
                  <p className="mt-1 text-zinc-400">{p.generated_reply}</p>
                  {p.generated_dm ? (
                    <>
                      <p className="mt-2 text-[10px] font-black uppercase text-emerald-400">Suggested DM</p>
                      <p className="mt-1 text-zinc-500">{p.generated_dm}</p>
                    </>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await generateSocialReplyAction(p.id);
                      if (!res.ok) setErr(res.error ?? 'Generate failed');
                      else router.refresh();
                    })
                  }
                  className="mt-3 rounded-lg border border-pink-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-pink-200 disabled:opacity-50"
                >
                  Generate reply / DM
                </button>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {(['replied', 'dm_sent', 'ignored', 'converted'] as const).map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await logSocialOutcomeAction(p.id, outcome, '');
                        router.refresh();
                      })
                    }
                    className="rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-500 hover:text-white"
                  >
                    Log {outcome.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {err ? <p className="mt-3 text-xs text-amber-300">{err}</p> : null}
    </section>
  );
}
