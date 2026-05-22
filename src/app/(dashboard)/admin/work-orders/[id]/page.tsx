import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Admin opens the same live work-order console technicians use. */
export default async function AdminWorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const source = typeof sp.source === 'string' ? sp.source : '';
  const q = new URLSearchParams({ shell: 'admin' });
  if (source) q.set('source', source);
  redirect(`/tech/work-orders/${encodeURIComponent(id)}?${q.toString()}`);
}
