'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Archive, 
  Trash2, 
  Search, 
  UserPlus, 
  Phone, 
  Mail, 
  MapPin, 
  Car, 
  FileText, 
  ClipboardList, 
  CheckCircle2, 
  ChevronRight, 
  Check, 
  X, 
  AlertTriangle, 
  Sparkles, 
  Filter,
  User,
  ExternalLink,
  MessageSquare,
  Clock,
  Layers,
  PhoneCall,
  Calendar,
  Eye,
  Info
} from 'lucide-react';
import {
  assignLeadTechnicianAction,
  archiveLeadAction,
  bulkArchiveLeadsAction,
  bulkDeleteLeadsAction,
  convertLeadToCustomerAction,
  createLeadAction,
  deleteLeadAction,
  incrementLeadContactAttemptsAction,
  setLeadPoolAction,
  unassignLeadAction,
  updateLeadNotesAction,
  updateLeadStatusAction,
} from '@/app/(dashboard)/admin/dispatch-lead-actions';

export type LeadAdminRow = Record<string, any>;
export type TechOption = { id: string; full_name: string | null; email: string | null };
export type AssignmentEventRow = {
  id: string;
  action: string;
  technician_id: string | null;
  previous_technician_id: string | null;
  actor_id: string | null;
  created_at: string;
  note: string | null;
};

const STATUSES = ['new', 'assigned', 'claimed', 'contacted', 'quoted', 'booked', 'no_response', 'lost'] as const;

const PIPELINE_STAGES = [
  { id: 'new', label: 'New Lead', color: 'border-blue-500/30 text-blue-400 bg-blue-500/5' },
  { id: 'quoted', label: 'Quoted', color: 'border-amber-500/30 text-amber-400 bg-amber-500/5' },
  { id: 'follow_up', label: 'Follow Up', color: 'border-purple-500/30 text-purple-400 bg-purple-500/5' },
  { id: 'scheduled', label: 'Scheduled', color: 'border-cyan-500/30 text-cyan-400 bg-cyan-500/5' },
  { id: 'won', label: 'Won', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' },
  { id: 'lost', label: 'Lost', color: 'border-zinc-500/35 text-zinc-400 bg-zinc-500/5' },
] as const;

function getLeadStage(r: LeadAdminRow): 'new' | 'quoted' | 'follow_up' | 'scheduled' | 'won' | 'lost' {
  const status = String(r.status ?? 'new');
  const hasCustomer = !!r.customer_id;
  
  if (status === 'lost') return 'lost';
  if (status === 'booked') {
    return hasCustomer ? 'won' : 'scheduled';
  }
  if (status === 'quoted') return 'quoted';
  if (status === 'contacted' || status === 'no_response') return 'follow_up';
  return 'new'; // covers 'new', 'assigned', 'claimed'
}

export function LeadsAdminClient({
  leads,
  technicians,
  eventsByLead,
  techById = {},
}: {
  leads: LeadAdminRow[];
  technicians: TechOption[];
  eventsByLead: Record<string, AssignmentEventRow[]>;
  techById?: Record<string, string>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  
  // Drawers / Modals State
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = (filteredLeads: LeadAdminRow[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allFilteredIds = filteredLeads.map(l => String(l.id));
      const hasAll = allFilteredIds.every(id => next.has(id));
      
      if (hasAll) {
        // Unselect all of these
        allFilteredIds.forEach(id => next.delete(id));
      } else {
        // Select all of these
        allFilteredIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const techOptions = useMemo(
    () => [...technicians].sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '')),
    [technicians],
  );

  // Filter leads by search query
  const filteredLeads = useMemo(() => {
    return leads.filter((r) => {
      const name = String(r.name ?? '').toLowerCase();
      const phone = String(r.phone ?? '').toLowerCase();
      const email = String(r.email ?? '').toLowerCase();
      const vehicle = String(r.vehicle ?? '').toLowerCase();
      const notes = String(r.notes ?? '').toLowerCase();
      const query = searchQuery.toLowerCase();
      
      return (
        name.includes(query) ||
        phone.includes(query) ||
        email.includes(query) ||
        vehicle.includes(query) ||
        notes.includes(query)
      );
    });
  }, [leads, searchQuery]);

  // Group leads into pipeline stages
  const pipelineGrouped = useMemo(() => {
    const m: Record<string, LeadAdminRow[]> = {
      new: [],
      quoted: [],
      follow_up: [],
      scheduled: [],
      won: [],
      lost: [],
    };
    for (const r of filteredLeads) {
      const stage = getLeadStage(r);
      m[stage]?.push(r);
    }
    return m;
  }, [filteredLeads]);

  // Find active lead details
  const activeLead = useMemo(() => {
    if (!activeLeadId) return null;
    return leads.find((l) => String(l.id) === activeLeadId) ?? null;
  }, [leads, activeLeadId]);

  // Lead statistics
  const stats = useMemo(() => {
    const total = leads.length;
    const newLeads = leads.filter(l => getLeadStage(l) === 'new').length;
    const active = leads.filter(l => ['quoted', 'follow_up'].includes(getLeadStage(l))).length;
    const won = leads.filter(l => getLeadStage(l) === 'won').length;
    return { total, newLeads, active, won };
  }, [leads]);

  return (
    <div className="space-y-6">
      {/* Alert Message */}
      <AnimatePresence>
        {msg && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between rounded-xl border border-gold/30 bg-black/90 p-4 text-sm text-gold-soft shadow-[0_0_24px_rgba(212,175,55,0.15)]"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" />
              <span>{msg}</span>
            </div>
            <button onClick={() => setMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CRM Executive Overview Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: stats.total, desc: 'All CRM entries' },
          { label: 'New Leads', value: stats.newLeads, desc: 'Needs attention', highlight: stats.newLeads > 0 },
          { label: 'Active Pipeline', value: stats.active, desc: 'Quoted & Follow ups' },
          { label: 'Won / Converted', value: stats.won, desc: 'Paid clients' },
        ].map((s, idx) => (
          <div key={idx} className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl backdrop-blur-md relative overflow-hidden group hover:border-gold/20 transition-all duration-300">
            <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
              <Layers className="h-12 w-12 text-gold" />
            </div>
            <p className="text-xs text-zinc-500 uppercase font-black tracking-wider">{s.label}</p>
            <p className={`text-2xl font-black mt-1 font-mono ${s.highlight ? 'text-gold-soft' : 'text-white'}`}>
              {s.value}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Global Action & Control Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/40 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-black/60 rounded-xl border border-white/10 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition-all font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-zinc-500 hover:text-white"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggles */}
          <div className="flex rounded-xl bg-black/60 border border-white/10 p-1">
            <button
              onClick={() => setView('pipeline')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                view === 'pipeline' ? 'bg-gold/15 text-gold-soft border border-gold/25' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                view === 'list' ? 'bg-gold/15 text-gold-soft border border-gold/25' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Detail List
            </button>
          </div>

          <Link href="/admin/dispatch" className="text-[10px] font-black uppercase tracking-wider bg-zinc-900 border border-white/5 hover:border-zinc-700 text-zinc-300 px-3 py-2.5 rounded-xl transition duration-200">
            Dispatch Board →
          </Link>

          {/* New Lead Drawer Trigger */}
          <button
            onClick={() => setIsCreateDrawerOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300 shadow-[0_4px_20px_rgba(212,175,55,0.15)]"
          >
            <Plus className="h-4.5 w-4.5 stroke-[3]" />
            New Lead
          </button>
        </div>
      </div>

      {/* Bulk action state bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between bg-gold/10 border border-gold/30 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <Info className="h-4.5 w-4.5 text-gold-soft" />
                <span className="text-xs font-semibold text-zinc-200">
                  {selected.size} lead{selected.size > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex gap-2">
                <form
                  action={async (fd) => {
                    fd.set('leadIds', [...selected].join(','));
                    const res = await bulkArchiveLeadsAction(fd);
                    setMsg(res.ok ? `Archived ${res.count ?? selected.size} lead(s).` : res.error ?? 'Failed');
                    setSelected(new Set());
                    router.refresh();
                  }}
                >
                  <button type="submit" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-[10px] font-black uppercase text-amber-300 hover:bg-amber-500/20 transition">
                    Archive Selected
                  </button>
                </form>
                <form
                  action={async (fd) => {
                    if (!window.confirm(`Delete the ${selected.size} selected leads permanently?`)) return;
                    fd.set('leadIds', [...selected].join(','));
                    const res = await bulkDeleteLeadsAction(fd);
                    setMsg(res.ok ? `Deleted ${res.count ?? selected.size} lead(s).` : res.error ?? 'Failed');
                    setSelected(new Set());
                    router.refresh();
                  }}
                >
                  <button type="submit" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-[10px] font-black uppercase text-rose-300 hover:bg-rose-500/20 transition">
                    Delete Selected
                  </button>
                </form>
                <button 
                  onClick={() => setSelected(new Set())}
                  className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIPELINE VIEW */}
      {view === 'pipeline' ? (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 scrollbar-thin scrollbar-thumb-zinc-800">
          <div className="flex gap-4 min-w-[1200px]">
            {PIPELINE_STAGES.map((stage) => {
              const columnLeads = pipelineGrouped[stage.id] ?? [];
              return (
                <section
                  key={stage.id}
                  className="flex-1 min-w-[260px] max-w-[320px] flex flex-col rounded-2xl border border-white/5 bg-zinc-950/40 p-3 h-[72vh] backdrop-blur-md"
                >
                  {/* Column Header */}
                  <header className={`flex items-center justify-between border-b border-white/5 pb-2 mb-3 px-1`}>
                    <div className="flex items-center gap-2">
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${stage.color}`}>
                        {stage.label}
                      </span>
                    </div>
                    <span className="text-xs font-bold font-mono text-zinc-500">{columnLeads.length}</span>
                  </header>

                  {/* Column Cards Container */}
                  <ul className="flex-1 space-y-2.5 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
                    {columnLeads.map((r) => {
                      const id = String(r.id);
                      const isSel = selected.has(id);
                      const tid = r.assigned_technician_id != null ? String(r.assigned_technician_id) : '';
                      const techLabel = tid ? techById[tid] ?? tid.slice(0, 8) : '';
                      const contactAttempts = Number(r.contact_attempts ?? 0);
                      
                      return (
                        <li
                          key={id}
                          onClick={() => setActiveLeadId(id)}
                          className={`group relative rounded-2xl border p-4 transition-all duration-300 cursor-pointer bg-zinc-900/60 hover:bg-zinc-900 ${
                            isSel 
                              ? 'border-gold bg-gold/5 shadow-[0_0_20px_rgba(212,175,55,0.06)]' 
                              : 'border-white/5 hover:border-zinc-700'
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleSelect(id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4 w-4"
                            />
                          </div>

                          <div className="space-y-2">
                            {/* Card Header info */}
                            <div className="pr-4">
                              <h4 className="font-bold text-white text-sm truncate group-hover:text-gold-soft transition duration-200">
                                {String(r.name ?? 'Guest')}
                              </h4>
                              {r.vehicle && (
                                <p className="text-[11px] font-medium text-zinc-300 flex items-center gap-1.5 mt-0.5 truncate">
                                  <Car className="h-3 w-3 text-gold-soft shrink-0" />
                                  <span>{String(r.vehicle)}</span>
                                </p>
                              )}
                            </div>

                            {/* Address details */}
                            {r.address && (
                              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <MapPin className="h-3 w-3 shrink-0 text-zinc-600" />
                                <span className="truncate">{String(r.address)}</span>
                              </p>
                            )}

                            {/* Badges footer */}
                            <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9px]">
                              {/* Tech indicator */}
                              <div className="flex items-center gap-1 text-zinc-400">
                                <User className="h-2.5 w-2.5 text-gold-soft" />
                                <span className="truncate max-w-[80px] font-medium">
                                  {techLabel || 'Unassigned'}
                                </span>
                              </div>
                              
                              {/* Contact attempts */}
                              <span className={`px-1.5 py-0.5 rounded-md text-zinc-500 font-mono ${
                                contactAttempts > 0 ? 'bg-zinc-950 text-zinc-300 border border-white/5' : ''
                              }`}>
                                {contactAttempts === 0 ? 'No attempts' : `${contactAttempts} attempt${contactAttempts > 1 ? 's' : ''}`}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    {columnLeads.length === 0 && (
                      <div className="py-12 text-center rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center p-4">
                        <ClipboardList className="h-6 w-6 text-zinc-800 mb-1" />
                        <p className="text-[10px] text-zinc-600 uppercase font-black tracking-wider">No Leads</p>
                      </div>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* DETAIL LIST VIEW */}
      {view === 'list' && (
        <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-wider text-zinc-500 bg-black/40">
                  <th className="py-3 px-4 w-10">
                    <input 
                      type="checkbox" 
                      checked={filteredLeads.length > 0 && filteredLeads.every(l => selected.has(String(l.id)))}
                      onChange={() => selectAllFiltered(filteredLeads)}
                      className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4 w-4"
                    />
                  </th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Status / Lane</th>
                  <th className="py-3 px-4">Vehicle Details</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Assigned Tech</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {filteredLeads.map((r) => {
                  const id = String(r.id);
                  const isSel = selected.has(id);
                  const stage = getLeadStage(r);
                  const stageLabel = PIPELINE_STAGES.find(s => s.id === stage)?.label ?? stage;
                  const statusLabel = String(r.status ?? 'new').replace(/_/g, ' ');
                  const tid = r.assigned_technician_id != null ? String(r.assigned_technician_id) : '';
                  const techLabel = tid ? techById[tid] ?? tid.slice(0, 8) : 'Unassigned';

                  return (
                    <tr 
                      key={id}
                      onClick={() => setActiveLeadId(id)}
                      className={`hover:bg-white/5 transition-colors cursor-pointer ${
                        isSel ? 'bg-gold/5' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(id)}
                          className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4 w-4"
                        />
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white text-sm">{String(r.name ?? 'Guest')}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5 space-y-0.5">
                          {r.phone && <p>{String(r.phone)}</p>}
                          {r.email && <p className="opacity-80 font-mono">{String(r.email)}</p>}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          stage === 'won' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5' :
                          stage === 'lost' ? 'border-zinc-500/30 text-zinc-400 bg-zinc-500/5' :
                          stage === 'scheduled' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/5' :
                          'border-amber-500/30 text-amber-400 bg-amber-500/5'
                        }`}>
                          {stageLabel}
                        </span>
                        <p className="text-[9px] text-zinc-500 mt-1 uppercase font-black font-mono tracking-wider">
                          ({statusLabel})
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-zinc-200">
                        {r.vehicle ? (
                          <div className="flex items-center gap-1.5">
                            <Car className="h-3.5 w-3.5 text-gold-soft shrink-0" />
                            <span>{String(r.vehicle)}</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-400 max-w-[200px] truncate">
                        {r.address ? String(r.address) : <span className="text-zinc-600">—</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-zinc-300">
                          <User className="h-3 w-3 text-gold-soft" />
                          <span>{techLabel}</span>
                        </div>
                        {r.in_pool && (
                          <span className="inline-block mt-1 text-[8px] uppercase tracking-wider font-black text-cyan-400 bg-cyan-400/5 px-1.5 py-0.2 rounded border border-cyan-400/20">
                            Pool active
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setActiveLeadId(id)}
                          className="p-1.5 bg-zinc-900 border border-white/5 rounded-lg text-zinc-400 hover:text-white transition"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-zinc-500">
                      No leads found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE NEW LEAD DRAWER */}
      <AnimatePresence>
        {isCreateDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Create New Lead</h3>
                  <p className="text-xs text-zinc-500">Add a prospect manually to the CRM pool.</p>
                </div>
                <button
                  onClick={() => setIsCreateDrawerOpen(false)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                className="flex-1 overflow-y-auto py-6 space-y-4 pr-1"
                action={async (fd) => {
                  setMsg(null);
                  const res = await createLeadAction(fd);
                  if (res.ok) {
                    setMsg('Manually added new lead to pipeline.');
                    setIsCreateDrawerOpen(false);
                    router.refresh();
                  } else {
                    setMsg(res.error ?? 'Failed to create lead.');
                  }
                }}
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Contact Name *
                  </label>
                  <input
                    name="name"
                    required
                    placeholder="e.g. John Doe"
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Phone Number
                    </label>
                    <input
                      name="phone"
                      type="tel"
                      placeholder="e.g. 512-555-0199"
                      className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      Email Address
                    </label>
                    <input
                      name="email"
                      type="email"
                      placeholder="e.g. john@example.com"
                      className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Vehicle Info
                  </label>
                  <input
                    name="vehicle"
                    placeholder="e.g. 2023 Porsche 911 GT3 (Black)"
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Service Address
                  </label>
                  <input
                    name="address"
                    placeholder="e.g. 123 Congress Ave, Austin, TX"
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    Administrative Notes
                  </label>
                  <textarea
                    name="notes"
                    rows={4}
                    placeholder="Include details about paint correction package interest, ceramic coatings, budget, timeline..."
                    className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-xs text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition font-medium"
                  />
                </div>

                <div className="flex items-center gap-2.5 bg-black/40 border border-white/5 p-4.5 rounded-2xl">
                  <input
                    type="checkbox"
                    id="new_lead_inPool"
                    name="inPool"
                    value="true"
                    className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4 w-4"
                  />
                  <label htmlFor="new_lead_inPool" className="text-[11px] font-semibold text-zinc-300 cursor-pointer select-none">
                    Add directly to Open Pool (any technician can claim)
                  </label>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsCreateDrawerOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300"
                  >
                    Save Prospect
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* LEAD CONTROL CENTER DRAWER (REDUCES VISIBLE ACTIONS BY 90%) */}
      <AnimatePresence>
        {activeLead && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveLeadId(null)}
              className="fixed inset-0 z-50 bg-black"
            />
            {/* Control Center Drawer */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)]"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/30 to-gold/5 text-sm font-black text-gold-soft border border-gold/20">
                    {String(activeLead.name ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-black text-white text-base leading-tight">
                      {String(activeLead.name ?? 'Guest')}
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mt-1">
                      Lead ID: #{String(activeLead.id).slice(0, 8)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveLeadId(null)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto py-5 space-y-5 pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
                {/* Executive Quick Actions */}
                <div className="grid grid-cols-2 gap-2 bg-black/40 border border-white/5 p-3 rounded-2xl">
                  {activeLead.phone ? (
                    <a
                      href={`tel:${activeLead.phone}`}
                      className="flex items-center justify-center gap-1.5 p-2 bg-zinc-900/60 border border-white/5 hover:border-gold/30 hover:bg-gold/5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200"
                    >
                      <PhoneCall className="h-3.5 w-3.5 text-gold-soft" />
                      Call Client
                    </a>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5 p-2 bg-zinc-900/20 border border-white/5 opacity-40 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-500 cursor-not-allowed">
                      <PhoneCall className="h-3.5 w-3.5" />
                      No Phone
                    </span>
                  )}
                  {activeLead.email ? (
                    <a
                      href={`mailto:${activeLead.email}`}
                      className="flex items-center justify-center gap-1.5 p-2 bg-zinc-900/60 border border-white/5 hover:border-gold/30 hover:bg-gold/5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200"
                    >
                      <Mail className="h-3.5 w-3.5 text-gold-soft" />
                      Email Client
                    </a>
                  ) : (
                    <span className="flex items-center justify-center gap-1.5 p-2 bg-zinc-900/20 border border-white/5 opacity-40 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-500 cursor-not-allowed">
                      <Mail className="h-3.5 w-3.5" />
                      No Email
                    </span>
                  )}
                </div>

                {/* Info Fields */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Contact & Info Details</h4>
                  
                  {activeLead.vehicle && (
                    <div className="flex gap-3 text-xs bg-zinc-900/30 border border-white/5 p-3 rounded-xl">
                      <Car className="h-4.5 w-4.5 text-gold-soft shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Vehicle Specification</p>
                        <p className="text-zinc-200 font-semibold mt-0.5">{String(activeLead.vehicle)}</p>
                      </div>
                    </div>
                  )}

                  {activeLead.address && (
                    <div className="flex gap-3 text-xs bg-zinc-900/30 border border-white/5 p-3 rounded-xl">
                      <MapPin className="h-4.5 w-4.5 text-gold-soft shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Service Location</p>
                        <p className="text-zinc-200 font-semibold mt-0.5 break-words">{String(activeLead.address)}</p>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeLead.address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-gold-soft hover:underline font-bold"
                        >
                          Google Maps Directions <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-zinc-900/30 border border-white/5 p-3 rounded-xl">
                      <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Total Attempts</p>
                      <p className="text-sm font-bold text-white mt-0.5">{Number(activeLead.contact_attempts ?? 0)} Logs</p>
                    </div>
                    <div className="bg-zinc-900/30 border border-white/5 p-3 rounded-xl">
                      <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500">Created Date</p>
                      <p className="text-[10px] font-bold text-white mt-1">
                        {activeLead.created_at ? new Date(String(activeLead.created_at)).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Workflow Status Management */}
                <div className="border-t border-white/5 pt-4 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Pipeline & Status Routing</h4>
                  
                  {/* Status Dropdown */}
                  <form
                    action={async (fd) => {
                      fd.set('leadId', activeLeadId!);
                      const res = await updateLeadStatusAction(fd);
                      setMsg(res.ok ? 'Updated prospect pipeline stage.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                    className="flex items-end gap-2"
                  >
                    <div className="flex-1 space-y-1">
                      <label className="text-[9px] uppercase font-black tracking-wider text-zinc-500">Status Stage</label>
                      <select 
                        name="status" 
                        defaultValue={String(activeLead.status)} 
                        className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ').toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase tracking-wider hover:border-gold/50 transition">
                      Save
                    </button>
                  </form>

                  {/* Technician Assignment */}
                  <div className="bg-zinc-900/20 border border-white/5 p-3.5 rounded-2xl space-y-3">
                    <form
                      action={async (fd) => {
                        fd.set('leadId', activeLeadId!);
                        const res = await assignLeadTechnicianAction(fd);
                        setMsg(res.ok ? 'Lead assigned to technician.' : res.error ?? 'Failed');
                        router.refresh();
                      }}
                      className="flex items-end gap-2"
                    >
                      <div className="flex-1 space-y-1">
                        <label className="text-[9px] uppercase font-black tracking-wider text-zinc-500">Assign Technician</label>
                        <select
                          name="technicianId"
                          className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                          defaultValue={String(activeLead.assigned_technician_id ?? '')}
                        >
                          <option value="" disabled>Select technician…</option>
                          {techOptions.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.full_name ?? t.email ?? t.id.slice(0, 6)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft hover:bg-gold/20 transition">
                        Assign
                      </button>
                    </form>

                    {/* Unassign / Pool toggles */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[10px]">
                      {activeLead.assigned_technician_id ? (
                        <form
                          action={async () => {
                            const fd = new FormData();
                            fd.set('leadId', activeLeadId!);
                            const res = await unassignLeadAction(fd);
                            setMsg(res.ok ? 'Unassigned technician, moved to pool.' : res.error ?? 'Failed');
                            router.refresh();
                          }}
                        >
                          <button type="submit" className="font-black uppercase tracking-wider text-amber-300/80 hover:text-amber-200 transition">
                            Unassign to open pool
                          </button>
                        </form>
                      ) : (
                        <span className="text-zinc-600 uppercase font-black tracking-wider">Not assigned</span>
                      )}

                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500">Pool:</span>
                        <form
                          action={async () => {
                            const fd = new FormData();
                            fd.set('leadId', activeLeadId!);
                            fd.set('inPool', activeLead.in_pool ? 'false' : 'true');
                            const res = await setLeadPoolAction(fd);
                            setMsg(res.ok ? (activeLead.in_pool ? 'Removed from open pool.' : 'Listed in open pool.') : res.error ?? 'Failed');
                            router.refresh();
                          }}
                        >
                          <button 
                            type="submit" 
                            className={`rounded-md px-2 py-0.5 border text-[9px] font-black uppercase transition ${
                              activeLead.in_pool 
                                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' 
                                : 'bg-zinc-900 text-zinc-500 border-white/5 hover:border-zinc-700'
                            }`}
                          >
                            {activeLead.in_pool ? 'OPEN POOL ON' : 'OPEN POOL OFF'}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operations & Notes */}
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500 font-mono">Prospect Notes</h4>
                  
                  <form
                    action={async (fd) => {
                      fd.set('leadId', activeLeadId!);
                      const res = await updateLeadNotesAction(fd);
                      setMsg(res.ok ? 'Saved prospect notes.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                    className="space-y-2"
                  >
                    <textarea
                      name="notes"
                      rows={3}
                      defaultValue={activeLead.notes != null ? String(activeLead.notes) : ''}
                      placeholder="Add special requests, pricing discussion details..."
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white focus:outline-none focus:border-gold/40"
                    />
                    <div className="flex justify-end">
                      <button type="submit" className="rounded-xl border border-white/15 px-3 py-1.5 text-[9px] font-black uppercase text-zinc-400 hover:text-white transition">
                        Save notes
                      </button>
                    </div>
                  </form>
                </div>

                {/* Contact Attempts Log */}
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Contact Log Timeline</h4>
                    
                    <form
                      action={async () => {
                        const fd = new FormData();
                        fd.set('leadId', activeLeadId!);
                        const res = await incrementLeadContactAttemptsAction(fd);
                        setMsg(res.ok ? 'Logged new outbound call/email attempt.' : res.error ?? 'Failed');
                        router.refresh();
                      }}
                    >
                      <button type="submit" className="text-[10px] font-black uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1 bg-emerald-500/5 border border-emerald-500/10 px-2 py-1 rounded-lg">
                        <Plus className="h-3 w-3 stroke-[3]" /> Log Attempt
                      </button>
                    </form>
                  </div>

                  {/* assignment history events list */}
                  {eventsByLead[activeLead.id] && eventsByLead[activeLead.id].length > 0 ? (
                    <ul className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-900 border border-white/5 p-2 rounded-xl bg-black/45">
                      {eventsByLead[activeLead.id].map((e) => (
                        <li key={e.id} className="text-[10px] border-b border-white/5 pb-1.5 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between text-zinc-500">
                            <span className="font-semibold">{e.action.toUpperCase()}</span>
                            <span className="font-mono">{new Date(e.created_at).toLocaleDateString()}</span>
                          </div>
                          {e.technician_id && (
                            <p className="text-zinc-400 mt-0.5">
                              Tech: {techById[e.technician_id] ?? e.technician_id.slice(0, 8)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-zinc-600 italic">No contact actions or events recorded yet.</p>
                  )}
                </div>

                {/* Lead Conversion to Customer (Primary CTA) */}
                <div className="border-t border-white/5 pt-4 space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Conversion Matrix</h4>
                  <form
                    action={async () => {
                      const fd = new FormData();
                      fd.set('leadId', activeLeadId!);
                      const res = await convertLeadToCustomerAction(fd);
                      if (res.ok && 'customerId' in res && res.customerId) {
                        setMsg('Converted successfully! Directing to customer CRM profile.');
                        setActiveLeadId(null);
                        router.push(`/admin/customers/${res.customerId}`);
                        return;
                      }
                      setMsg(res.ok ? 'Converted successfully.' : (res as any).error ?? 'Failed conversion.');
                      router.refresh();
                    }}
                  >
                    <button 
                      type="submit" 
                      className="w-full py-3 bg-gradient-to-r from-gold/80 to-gold text-black rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 transition duration-300 flex items-center justify-center gap-1.5 shadow-[0_0_24px_rgba(212,175,55,0.2)]"
                    >
                      <UserPlus className="h-4.5 w-4.5 stroke-[2.5]" />
                      Convert to CRM Customer
                    </button>
                  </form>
                </div>

                {/* Danger Zone (Archive & Delete) */}
                <div className="border-t border-white/10 pt-4 space-y-3 bg-rose-500/5 -mx-6 px-6 pb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-rose-400 mt-2">Danger Zone</h4>
                  
                  <div className="flex gap-2.5">
                    <form
                      className="flex-1"
                      action={async () => {
                        const fd = new FormData();
                        fd.set('leadId', activeLeadId!);
                        const res = await archiveLeadAction(fd);
                        setMsg(res.ok ? 'Archived prospect. Moved to lost.' : res.error ?? 'Failed');
                        setActiveLeadId(null);
                        router.refresh();
                      }}
                    >
                      <button type="submit" className="w-full py-2 bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition">
                        Archive Lead
                      </button>
                    </form>
                    
                    <form
                      className="flex-1"
                      action={async () => {
                        if (!window.confirm('Are you sure you want to permanently delete this lead?')) return;
                        const fd = new FormData();
                        fd.set('leadId', activeLeadId!);
                        const res = await deleteLeadAction(fd);
                        setMsg(res.ok ? 'Lead deleted successfully.' : res.error ?? 'Failed');
                        setActiveLeadId(null);
                        router.refresh();
                      }}
                    >
                      <button type="submit" className="w-full py-2 bg-rose-950/20 border border-rose-500/20 text-rose-300 hover:bg-rose-500/25 rounded-xl text-[10px] font-black uppercase tracking-wider transition">
                        Delete Lead
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
