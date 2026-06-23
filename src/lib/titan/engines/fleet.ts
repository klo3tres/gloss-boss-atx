import type { TitanProspect } from '@/lib/titan/lead-radar';
import { prospectTypeLabel } from '@/lib/titan/lead-radar';
import { buildOutreachForProspect } from '@/lib/titan/engines/outreach';

const FLEET_TYPES = new Set(['fleet_operator', 'dealership', 'construction', 'landscaping']);

export type FleetAccount = {
  id: string;
  companyName: string;
  fleetType: string;
  revenuePotentialCents: number;
  vehicleCount: number | null;
  decisionMaker: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  nextAction: string;
  outreachSms: string;
  href: string;
};

export type FleetEngine = {
  accounts: FleetAccount[];
  totalPotentialCents: number;
};

export function buildFleetEngine(prospects: TitanProspect[]): FleetEngine {
  const accounts = prospects
    .filter((p) => FLEET_TYPES.has(p.prospectType))
    .sort((a, b) => b.estimatedMonthlyCents - a.estimatedMonthlyCents)
    .map((p) => {
      const kit = buildOutreachForProspect(p);
      return {
        id: p.id,
        companyName: p.companyName,
        fleetType: prospectTypeLabel(p.prospectType),
        revenuePotentialCents: p.estimatedMonthlyCents * 12,
        vehicleCount: p.vehicleCount,
        decisionMaker: p.contactName,
        phone: p.phone,
        email: p.email,
        status: p.status,
        nextAction:
          p.status === 'new' ? 'Send fleet proposal (copy SMS)' : p.status === 'contacted' ? 'Follow up in 3 days' : 'Advance to pipeline',
        outreachSms: kit.sms,
        href: '/admin/super',
      };
    });

  return {
    accounts,
    totalPotentialCents: accounts.reduce((s, a) => s + a.revenuePotentialCents, 0),
  };
}
