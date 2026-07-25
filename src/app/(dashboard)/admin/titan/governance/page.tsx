import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanGovernanceClient } from '@/components/titan/titan-governance-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { dashboardShellRoleForProfile } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
export const dynamic='force-dynamic';
export default async function TitanGovernancePage(){
 const session=await getSessionWithProfile();const admin=tryCreateAdminSupabase();let policies:any[]=[];let outcomes:any[]=[];
 if(admin){const [p,o]=await Promise.all([admin.from('titan_autonomy_policies').select('*').order('workflow'),admin.from('titan_recommendation_outcomes').select('*').order('created_at',{ascending:false}).limit(100)]);policies=p.data??[];outcomes=o.data??[]}
 return <DashboardShell title="Titan Governance" subtitle="Evidence-backed learning and owner-controlled autonomy." role={dashboardShellRoleForProfile(session.profile?.role??null)} titanMode><TitanGovernanceClient initialPolicies={policies} outcomes={outcomes}/></DashboardShell>
}

