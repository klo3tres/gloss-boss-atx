import { AdminLayoutClient } from '@/components/admin/admin-layout-client';

export default async function AdminLayout({
  children,
  automation,
}: {
  children: React.ReactNode;
  automation: React.ReactNode;
}) {
  return (
    <AdminLayoutClient>
      {automation}
      {children}
    </AdminLayoutClient>
  );
}
