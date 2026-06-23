import type { TitanBriefing } from '@/lib/titan-briefing';
import type { GraphEdge, GraphNode, OpportunityGraph } from '@/lib/titan/engines/types';

/** Relationship paths from customers → territory, referral, and partner adjacency. */
export function buildOpportunityGraph(briefing: TitanBriefing): OpportunityGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const avg = Math.max(briefing.insights.avgJobCents, 15000);

  for (const t of briefing.territory.territories.slice(0, 5)) {
    nodes.push({ id: `territory:${t.id}`, label: t.label, kind: 'territory' });
  }

  for (const opp of briefing.intelligence.opportunities.slice(0, 6)) {
    const nodeId = `customer:${opp.customerKey}`;
    nodes.push({ id: nodeId, label: opp.customerName, kind: 'customer' });
    const cityNode = briefing.territory.territories[0];
    if (cityNode) {
      edges.push({
        id: `edge:${opp.customerKey}:rebook`,
        fromId: nodeId,
        toId: `territory:${cityNode.id}`,
        relationship: 'Rebook opportunity',
        revenuePotentialCents: Math.round(avg * (opp.rebookProbability / 100)),
      });
    }
  }

  if (briefing.widgetStats.leadsCreated > 0) {
    const refId = 'referral:widget';
    nodes.push({ id: refId, label: 'Ask Titan widget leads', kind: 'referral' });
    edges.push({
      id: 'edge:widget:referral',
      fromId: refId,
      toId: nodes[0]?.id ?? refId,
      relationship: `${briefing.widgetStats.leadsCreated} referral path(s)`,
      revenuePotentialCents: briefing.widgetStats.leadsCreated * avg,
    });
  }

  const topPartner = briefing.growth.radar.prospects
    .filter((p) => ['apartment_complex', 'hoa', 'property_manager'].includes(p.prospectType))
    .sort((a, b) => b.estimatedMonthlyCents - a.estimatedMonthlyCents)[0];

  if (topPartner) {
    const pid = `partner:${topPartner.id}`;
    nodes.push({ id: pid, label: topPartner.companyName, kind: topPartner.prospectType === 'hoa' ? 'hoa' : 'partner' });
    edges.push({
      id: `edge:partner:${topPartner.id}`,
      fromId: pid,
      toId: nodes.find((n) => n.kind === 'territory')?.id ?? pid,
      relationship: 'Partnership expansion',
      revenuePotentialCents: topPartner.estimatedMonthlyCents * 12,
    });
  }

  const insight =
    edges.length > 0
      ? `Titan mapped ${nodes.length} nodes and ${edges.length} revenue paths — not isolated leads.`
      : 'Complete more jobs and add partner prospects to grow the opportunity graph.';

  return { nodes: nodes.slice(0, 12), edges: edges.slice(0, 12), insight };
}
