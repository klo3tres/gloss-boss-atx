import { redirect } from 'next/navigation';

export default async function AdminMediaRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tab = typeof sp.tab === 'string' ? sp.tab : 'registry';
  redirect(`/admin/media-studio?tab=${tab}`);
}
