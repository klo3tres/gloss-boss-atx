'use client';

import { useState } from 'react';
import { Building2, X, Phone, Mail, User, Clock, DollarSign, Calendar, ShieldCheck, ExternalLink, Plus } from 'lucide-react';
import { displayMoney } from '@/lib/display-format';
import {
  updateFleetInquiryDetailsAction,
  convertFleetToCustomerAction,
  convertFleetToWorkOrderAction,
  sendFleetQuoteEmailAction
} from '@/app/(dashboard)/admin/fleet/actions';

type Inquiry = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string | null;
  fleet_size?: string | null;
  message?: string | null;
  status: string;
  created_at: string;
  internal_notes?: string | null;
  quote_amount_cents?: number | null;
  quoted_services?: string | null;
  follow_up_date?: string | null;
  contact_history?: Array<{
    date: string;
    type: string;
    notes: string;
  }> | null;
  assigned_technician_id?: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type FleetInboxClientProps = {
  initialInquiries: Inquiry[];
  technicians: Profile[];
  fleetPricing: any;
  fleetEnabled: boolean;
  fleetBlurb: string;
  savePricingAction: (formData: FormData) => Promise<void>;
  saveVisibilityAction: (formData: FormData) => Promise<void>;
};

export function FleetInboxClient({
  initialInquiries,
  technicians,
  fleetPricing,
  fleetEnabled,
  fleetBlurb,
  savePricingAction,
  saveVisibilityAction
}: FleetInboxClientProps) {
  const [inquiries, setInquiries] = useState<Inquiry[]>(initialInquiries);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [activeTab, setActiveTab] = useState<'inbox' | 'settings'>('inbox');
  const [statusFilter, setStatusFilter] = useState<string>('new');
  
  // Drawer state
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  
  // Custom contact event inputs
  const [newLogType, setNewLogType] = useState('call');
  const [newLogNotes, setNewLogNotes] = useState('');

  // Conversion inputs
  const [selectedService, setSelectedService] = useState('exterior-wash');
  const [selectedClass, setSelectedClass] = useState('sedan');

  const filteredInquiries = inquiries.filter((i) => {
    return i.status.toLowerCase() === statusFilter.toLowerCase();
  });

  const selectInquiry = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setActionMsg(null);
    setNewLogNotes('');
  };

  const handleUpdateDetails = async (updates: Partial<Inquiry>) => {
    if (!selectedInquiry) return;
    setBusy(true);
    setActionMsg(null);
    
    // Merge new updates
    const mergedUpdates = { ...selectedInquiry, ...updates };
    
    const res = await updateFleetInquiryDetailsAction(selectedInquiry.id, {
      status: mergedUpdates.status,
      internal_notes: mergedUpdates.internal_notes,
      quote_amount_cents: mergedUpdates.quote_amount_cents,
      quoted_services: mergedUpdates.quoted_services,
      follow_up_date: mergedUpdates.follow_up_date,
      assigned_technician_id: mergedUpdates.assigned_technician_id,
      contact_history: mergedUpdates.contact_history,
    });

    setBusy(false);
    if ('error' in res && res.error) {
      setActionMsg({ tone: 'err', text: res.error });
    } else {
      setInquiries(prev => prev.map(i => i.id === selectedInquiry.id ? { ...i, ...updates } : i));
      setSelectedInquiry(prev => prev ? { ...prev, ...updates } : null);
      setActionMsg({ tone: 'ok', text: 'Details updated successfully.' });
    }
  };

  const handleAddContactLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry || !newLogNotes.trim()) return;

    const logEntry = {
      date: new Date().toISOString(),
      type: newLogType,
      notes: newLogNotes.trim(),
    };

    const newHistory = [...(selectedInquiry.contact_history || []), logEntry];
    await handleUpdateDetails({ contact_history: newHistory });
    setNewLogNotes('');
  };

  const handleConvertCustomer = async () => {
    if (!selectedInquiry) return;
    setBusy(true);
    setActionMsg(null);

    const res = await convertFleetToCustomerAction(selectedInquiry.id);
    setBusy(false);
    
    if ('error' in res && res.error) {
      setActionMsg({ tone: 'err', text: res.error });
    } else {
      setActionMsg({ tone: 'ok', text: res.message || 'Converted successfully.' });
      // Reload details to capture the updated contact log
      const updatedLogs = [
        ...(selectedInquiry.contact_history || []),
        { date: new Date().toISOString(), type: 'system', notes: 'Converted to CRM Customer' }
      ];
      setInquiries(prev => prev.map(i => i.id === selectedInquiry.id ? { ...i, contact_history: updatedLogs } : i));
      setSelectedInquiry(prev => prev ? { ...prev, contact_history: updatedLogs } : null);
    }
  };

  const handleConvertWorkOrder = async () => {
    if (!selectedInquiry) return;
    setBusy(true);
    setActionMsg(null);

    const res = await convertFleetToWorkOrderAction(selectedInquiry.id, selectedService, selectedClass);
    setBusy(false);

    if ('error' in res && res.error) {
      setActionMsg({ tone: 'err', text: res.error });
    } else {
      setActionMsg({ tone: 'ok', text: res.message || 'Work order created.' });
      // Update local state to reflect that status is now "won" and log added
      const updatedLogs = [
        ...(selectedInquiry.contact_history || []),
        { date: new Date().toISOString(), type: 'system', notes: 'Converted to Work Order' }
      ];
      setInquiries(prev => prev.map(i => i.id === selectedInquiry.id ? { ...i, status: 'won', contact_history: updatedLogs } : i));
      setSelectedInquiry(prev => prev ? { ...prev, status: 'won', contact_history: updatedLogs } : null);
    }
  };

  const handleSendQuoteEmail = async () => {
    if (!selectedInquiry) return;
    setBusy(true);
    setActionMsg(null);

    const res = await sendFleetQuoteEmailAction(selectedInquiry.id);
    setBusy(false);

    if ('error' in res && res.error) {
      setActionMsg({ tone: 'err', text: res.error });
    } else {
      setActionMsg({ tone: 'ok', text: res.message || 'Proposal email sent.' });
      // Proposal email sends automatically transition state to "quoted" and log
      const updatedLogs = [
        ...(selectedInquiry.contact_history || []),
        { date: new Date().toISOString(), type: 'email', notes: 'Sent quote proposal email.' }
      ];
      setInquiries(prev => prev.map(i => i.id === selectedInquiry.id ? { ...i, status: 'quoted', contact_history: updatedLogs } : i));
      setSelectedInquiry(prev => prev ? { ...prev, status: 'quoted', contact_history: updatedLogs } : null);
    }
  };

  return (
    <div className='flex flex-col gap-6'>
      {/* Navigation tabs */}
      <div className='flex border-b border-white/10'>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`px-5 py-3 text-sm font-black uppercase tracking-wider transition ${activeTab === 'inbox' ? 'border-b-2 border-gold text-gold-soft' : 'text-zinc-400 hover:text-white'}`}
        >
          Inquiries Inbox
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-5 py-3 text-sm font-black uppercase tracking-wider transition ${activeTab === 'settings' ? 'border-b-2 border-gold text-gold-soft' : 'text-zinc-400 hover:text-white'}`}
        >
          Public Fleet Settings
        </button>
      </div>

      {activeTab === 'inbox' && (
        <div className='grid gap-6 lg:grid-cols-3'>
          {/* Main Inquiry Inbox List (span 2 if drawer open, else 3) */}
          <div className={`${selectedInquiry ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-4`}>
            {/* Filtering pills */}
            <div className='flex flex-wrap gap-2'>
              {['new', 'contacted', 'quoted', 'won', 'lost', 'archived'].map((status) => {
                const count = inquiries.filter((i) => i.status.toLowerCase() === status).length;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                      statusFilter === status
                        ? 'bg-gold text-black'
                        : 'border border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {status} ({count})
                  </button>
                );
              })}
            </div>

            {/* List */}
            <div className='grid gap-3'>
              {filteredInquiries.length === 0 ? (
                <div className='rounded-3xl border border-dashed border-white/10 p-12 text-center text-zinc-500 bg-zinc-950/40'>
                  <Building2 className='mx-auto mb-3 h-10 w-10 text-gold-soft/50' />
                  <p className='text-sm font-bold uppercase tracking-wider'>No inquiries in this folder</p>
                </div>
              ) : (
                filteredInquiries.map((i) => (
                  <div
                    key={i.id}
                    onClick={() => selectInquiry(i)}
                    className={`cursor-pointer rounded-2xl border p-5 transition ${
                      selectedInquiry?.id === i.id
                        ? 'border-gold bg-zinc-950 shadow-[0_0_20px_rgba(212,166,77,0.15)]'
                        : 'border-white/10 bg-black/45 hover:border-gold/40 hover:bg-zinc-950/60'
                    }`}
                  >
                    <div className='flex items-start justify-between gap-4'>
                      <div>
                        <div className='flex items-center gap-2'>
                          <h3 className='text-lg font-black text-white'>{i.company_name}</h3>
                          <span className='rounded bg-gold/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-gold-soft'>
                            {i.fleet_size || 'Pending size'}
                          </span>
                        </div>
                        <p className='mt-1 text-sm text-zinc-400'>
                          {i.contact_name} · {i.email} {i.phone ? `· ${i.phone}` : ''}
                        </p>
                        <p className='mt-2 text-xs text-zinc-500'>
                          Submitted on {new Date(i.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className='text-right'>
                        {i.quote_amount_cents ? (
                          <p className='text-lg font-black text-gold-soft'>{displayMoney(i.quote_amount_cents)}</p>
                        ) : (
                          <p className='text-xs font-bold uppercase tracking-wider text-zinc-500'>Unquoted</p>
                        )}
                        {i.follow_up_date && (
                          <p className='mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-400 uppercase font-black'>
                            <Calendar size={10} /> {new Date(i.follow_up_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Inquiry Detail Drawer (collapses/slide-over simulated on col 3) */}
          {selectedInquiry && (
            <div className='rounded-3xl border border-gold/30 bg-zinc-950 p-6 shadow-2xl flex flex-col gap-5 h-fit relative lg:sticky lg:top-6'>
              <button
                onClick={() => setSelectedInquiry(null)}
                className='absolute top-4 right-4 text-zinc-400 hover:text-white transition'
              >
                <X size={20} />
              </button>

              <div>
                <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Fleet inquiry details</p>
                <h2 className='mt-1 text-2xl font-black uppercase text-white'>{selectedInquiry.company_name}</h2>
              </div>

              {/* Status and Tech dropdowns */}
              <div className='grid gap-3 sm:grid-cols-2'>
                <label className='block text-xs text-zinc-400'>
                  Status
                  <select
                    value={selectedInquiry.status}
                    disabled={busy}
                    onChange={(e) => handleUpdateDetails({ status: e.target.value })}
                    className='mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white'
                  >
                    <option value='new'>New</option>
                    <option value='contacted'>Contacted</option>
                    <option value='quoted'>Quoted</option>
                    <option value='won'>Won</option>
                    <option value='lost'>Lost</option>
                    <option value='archived'>Archived</option>
                  </select>
                </label>

                <label className='block text-xs text-zinc-400'>
                  Assigned Tech
                  <select
                    value={selectedInquiry.assigned_technician_id || ''}
                    disabled={busy}
                    onChange={(e) => handleUpdateDetails({ assigned_technician_id: e.target.value || null })}
                    className='mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-xs font-bold uppercase tracking-wider text-white'
                  >
                    <option value=''>Unassigned</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name || t.email || 'Tech'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Quick Contact info */}
              <div className='rounded-2xl border border-white/5 bg-black/30 p-4 flex flex-col gap-2 text-xs text-zinc-300'>
                <div className='flex items-center gap-2'>
                  <User size={14} className='text-gold-soft' />
                  <span className='font-bold'>{selectedInquiry.contact_name}</span>
                </div>
                <div className='flex items-center gap-2'>
                  <Mail size={14} className='text-gold-soft' />
                  <a href={`mailto:${selectedInquiry.email}`} className='hover:underline hover:text-gold-soft'>{selectedInquiry.email}</a>
                </div>
                {selectedInquiry.phone && (
                  <div className='flex items-center gap-2'>
                    <Phone size={14} className='text-gold-soft' />
                    <a href={`tel:${selectedInquiry.phone}`} className='hover:underline hover:text-gold-soft'>{selectedInquiry.phone}</a>
                  </div>
                )}
                {selectedInquiry.message && (
                  <div className='mt-2 rounded-xl bg-zinc-900/80 p-3 border border-white/5'>
                    <p className='font-black uppercase tracking-wider text-[9px] text-zinc-500'>Initial Message</p>
                    <p className='mt-1 font-mono text-zinc-300 text-[11px] whitespace-pre-wrap leading-relaxed'>{selectedInquiry.message}</p>
                  </div>
                )}
              </div>

              {/* Internal Notes */}
              <div>
                <label className='block text-xs text-zinc-400'>
                  Internal Notes
                  <textarea
                    rows={2}
                    defaultValue={selectedInquiry.internal_notes || ''}
                    onBlur={(e) => handleUpdateDetails({ internal_notes: e.target.value.trim() })}
                    placeholder='Notes on locations, schedules, pricing details...'
                    className='mt-1 w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-xs text-white'
                  />
                </label>
              </div>

              {/* Quote Editor */}
              <div className='grid gap-3 sm:grid-cols-2'>
                <label className='block text-xs text-zinc-400'>
                  Quote Amount ($)
                  <input
                    type='number'
                    step='0.01'
                    defaultValue={selectedInquiry.quote_amount_cents ? (selectedInquiry.quote_amount_cents / 100).toFixed(2) : ''}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      const cents = isNaN(val) ? null : Math.round(val * 100);
                      handleUpdateDetails({ quote_amount_cents: cents });
                    }}
                    placeholder='0.00'
                    className='mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-xs text-white font-mono'
                  />
                </label>
                <label className='block text-xs text-zinc-400'>
                  Follow-up / Schedule Date
                  <input
                    type='datetime-local'
                    defaultValue={selectedInquiry.follow_up_date ? new Date(selectedInquiry.follow_up_date).toISOString().slice(0, 16) : ''}
                    onBlur={(e) => {
                      const val = e.target.value ? new Date(e.target.value).toISOString() : null;
                      handleUpdateDetails({ follow_up_date: val });
                    }}
                    className='mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-xs text-white'
                  />
                </label>
              </div>

              <div>
                <label className='block text-xs text-zinc-400'>
                  Quoted Services Description
                  <input
                    type='text'
                    defaultValue={selectedInquiry.quoted_services || ''}
                    onBlur={(e) => handleUpdateDetails({ quoted_services: e.target.value.trim() })}
                    placeholder='e.g., Bi-weekly 4 Sedan Wash Plan'
                    className='mt-1 w-full rounded-lg border border-white/15 bg-black px-3 py-2 text-xs text-white'
                  />
                </label>
              </div>

              {/* Action Log / Feedback Message */}
              {actionMsg && (
                <div className={`rounded-xl border px-3 py-2 text-xs ${
                  actionMsg.tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-red-500/30 bg-red-500/10 text-red-100'
                }`}>
                  {actionMsg.text}
                </div>
              )}

              {/* Action Buttons */}
              <div className='flex flex-col gap-2'>
                <div className='grid grid-cols-2 gap-2'>
                  <button
                    onClick={handleSendQuoteEmail}
                    disabled={busy}
                    className='rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 text-xs font-black uppercase text-gold-soft hover:bg-gold/25 transition disabled:opacity-50'
                  >
                    Send Quote Email
                  </button>
                  <button
                    onClick={handleConvertCustomer}
                    disabled={busy}
                    className='rounded-xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-xs font-black uppercase text-white hover:bg-zinc-800 transition disabled:opacity-50'
                  >
                    Convert to Customer
                  </button>
                </div>

                <div className='rounded-2xl border border-white/5 bg-black/40 p-3 flex flex-col gap-2.5'>
                  <p className='font-black uppercase tracking-wider text-[9px] text-zinc-500'>Convert to Work Order</p>
                  <div className='grid grid-cols-2 gap-2'>
                    <select
                      value={selectedService}
                      onChange={(e) => setSelectedService(e.target.value)}
                      className='rounded border border-white/10 bg-black px-2 py-1.5 text-[11px] text-white'
                    >
                      <option value='exterior-wash'>Exterior Wash</option>
                      <option value='interior-detail'>Interior Detail</option>
                      <option value='full-detail'>Full Detail</option>
                      <option value='ceramic-coating'>Ceramic Coating</option>
                      <option value='fleet-detailing'>Fleet Detailing</option>
                    </select>
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      className='rounded border border-white/10 bg-black px-2 py-1.5 text-[11px] text-white'
                    >
                      <option value='sedan'>Sedan</option>
                      <option value='suv'>SUV</option>
                      <option value='truck'>Truck</option>
                      <option value='suv_truck'>SUV / Truck</option>
                    </select>
                  </div>
                  <button
                    onClick={handleConvertWorkOrder}
                    disabled={busy}
                    className='w-full rounded-xl bg-gold px-3 py-2 text-xs font-black uppercase text-black hover:bg-gold-light transition disabled:opacity-50'
                  >
                    Create Work Order
                  </button>
                </div>
              </div>

              {/* Contact History */}
              <div className='border-t border-white/10 pt-4 flex flex-col gap-3'>
                <p className='text-xs font-black uppercase tracking-wider text-zinc-400'>Contact History</p>
                
                {/* List of past contact logs */}
                <div className='flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1'>
                  {(!selectedInquiry.contact_history || selectedInquiry.contact_history.length === 0) ? (
                    <p className='text-xs italic text-zinc-500'>No history events yet.</p>
                  ) : (
                    selectedInquiry.contact_history.map((log, index) => (
                      <div key={index} className='rounded-xl bg-black/30 p-2.5 border border-white/5 text-[11px]'>
                        <div className='flex items-center justify-between text-zinc-500 font-bold'>
                          <span className='uppercase text-gold-soft tracking-wider text-[9px]'>{log.type}</span>
                          <span>{new Date(log.date).toLocaleDateString()}</span>
                        </div>
                        <p className='mt-1 text-zinc-300'>{log.notes}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add new contact log form */}
                <form onSubmit={handleAddContactLog} className='flex flex-col gap-2 mt-1'>
                  <div className='flex gap-2'>
                    <select
                      value={newLogType}
                      onChange={(e) => setNewLogType(e.target.value)}
                      className='rounded border border-white/10 bg-black px-2 py-1 text-xs text-white'
                    >
                      <option value='call'>Call</option>
                      <option value='email'>Email</option>
                      <option value='meeting'>Meeting</option>
                      <option value='system'>System</option>
                      <option value='other'>Other</option>
                    </select>
                    <input
                      type='text'
                      value={newLogNotes}
                      onChange={(e) => setNewLogNotes(e.target.value)}
                      placeholder='Add log notes...'
                      required
                      className='flex-1 rounded border border-white/10 bg-black px-2.5 py-1 text-xs text-white'
                    />
                    <button
                      type='submit'
                      disabled={busy}
                      className='rounded bg-zinc-800 hover:bg-zinc-700 px-3 text-white transition disabled:opacity-50'
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className='grid gap-6 lg:grid-cols-2'>
          {/* Public Visibility */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await saveVisibilityAction(fd);
              alert('Public visibility settings saved successfully.');
            }}
            className='rounded-3xl border border-gold/20 bg-zinc-950 p-6 flex flex-col gap-4'
          >
            <div>
              <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Public visibility</p>
              <h3 className='mt-1 text-lg font-black text-white'>Show/Hide Public Fleet Block</h3>
            </div>
            
            <label className='flex items-center gap-2 text-sm text-zinc-200 cursor-pointer'>
              <input
                name='fleetEnabled'
                type='checkbox'
                defaultChecked={fleetEnabled}
                className='accent-[var(--gold)] w-4 h-4 rounded border-white/15 bg-black'
              />
              Show fleet section on public Services page
            </label>
            
            <label className='block text-xs text-zinc-400'>
              Public fleet copy blurb
              <textarea
                name='fleetBlurb'
                rows={4}
                defaultValue={fleetBlurb}
                className='mt-1 w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white'
              />
            </label>
            
            <button type='submit' className='rounded-xl bg-gold px-4 py-2.5 text-xs font-black uppercase text-black self-start hover:bg-gold-light transition'>
              Save public settings
            </button>
          </form>

          {/* Pricing Tiers */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await savePricingAction(fd);
              alert('Fleet pricing configurations saved successfully.');
            }}
            className='rounded-3xl border border-gold/20 bg-zinc-950 p-6 flex flex-col gap-4'
          >
            <div>
              <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Fleet pricing tiers</p>
              <h3 className='mt-1 text-lg font-black text-white'>Customize Tier Descriptions</h3>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              {(
                [
                  ['smallLabel', 'Small tier label'],
                  ['smallDetail', 'Small tier detail'],
                  ['mediumLabel', 'Medium tier label'],
                  ['mediumDetail', 'Medium tier detail'],
                  ['largeLabel', 'Large tier label'],
                  ['largeDetail', 'Large tier detail'],
                  ['weeklyDiscount', 'Weekly discount'],
                  ['biweeklyDiscount', 'Bi-weekly discount'],
                  ['monthlyDiscount', 'Monthly discount'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className='block text-xs text-zinc-400'>
                  {label}
                  <input
                    name={key}
                    defaultValue={fleetPricing[key]}
                    className='mt-1 w-full rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-sm text-white'
                  />
                </label>
              ))}
            </div>

            <label className='block text-xs text-zinc-400'>
              Commercial notes
              <textarea
                name='commercialNotes'
                rows={2}
                defaultValue={fleetPricing.commercialNotes}
                className='mt-1 w-full rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-sm text-white'
              />
            </label>

            <button type='submit' className='rounded-xl bg-gold px-4 py-2.5 text-xs font-black uppercase text-black self-start hover:bg-gold-light transition'>
              Save fleet pricing
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
