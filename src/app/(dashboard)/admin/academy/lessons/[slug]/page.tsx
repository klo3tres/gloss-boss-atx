import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { ACADEMY_RESOURCES } from '@/lib/titan/business-academy';
import { loadAcademyArticlesFromCms } from '@/app/(dashboard)/admin/academy/actions';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { markAcademyLessonCompleteAction } from '@/app/(dashboard)/admin/academy/actions';

export const dynamic = 'force-dynamic';

export default async function AcademyLessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) notFound();

  const admin = tryCreateAdminSupabase();
  const cmsArticles = await loadAcademyArticlesFromCms(admin);
  const all = [
    ...cmsArticles.map((a) => ({ id: `cms-${a.id}`, title: a.title, summary: a.summary, href: a.href, type: 'article' as const })),
    ...ACADEMY_RESOURCES,
  ];
  const lesson = all.find((r) => r.id === slug || r.href.includes(slug));
  if (!lesson) notFound();

  const external = lesson.href.startsWith('http');

  return (
    <DashboardShell title={lesson.title} subtitle={lesson.summary} role="admin">
      <Link href="/admin/academy" className="text-xs font-bold uppercase text-gold-soft hover:underline">
        ← Business Academy
      </Link>
      <section className="mt-4 rounded-3xl border border-border bg-card p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">{lesson.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {external ? (
            <a href={lesson.href} target="_blank" rel="noreferrer" className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black">
              Open lesson →
            </a>
          ) : (
            <Link href={lesson.href} className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black">
              Continue →
            </Link>
          )}
          <form action={markAcademyLessonCompleteAction}>
            <input type="hidden" name="lessonId" value={lesson.id} />
            <button type="submit" className="rounded-xl border border-border px-4 py-2.5 text-[10px] font-black uppercase text-muted-foreground">
              Mark complete
            </button>
          </form>
        </div>
      </section>
    </DashboardShell>
  );
}
