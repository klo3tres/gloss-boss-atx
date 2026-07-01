import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AddPastJobRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const qs = new URLSearchParams();
  qs.set('mode', 'completed');
  for (const [k, v] of Object.entries(params)) {
    if (k === 'mode') continue;
    if (typeof v === 'string') qs.set(k, v);
  }
  redirect(`/admin/work-orders/add?${qs.toString()}`);
}
