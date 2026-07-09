import TitanLayoutClient from '@/components/titan/titan-layout-client';

export default function TitanWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <TitanLayoutClient>{children}</TitanLayoutClient>;
}
