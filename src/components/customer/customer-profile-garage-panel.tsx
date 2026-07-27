'use client';

import { useState, useTransition } from 'react';
import { Car, MapPin, Plus, Save, UserRound } from 'lucide-react';
import {
  addCustomerVehicleAction,
  updateCustomerProfileAction,
  updateCustomerVehicleAction,
  type CustomerSettingsActionResult,
} from '@/app/(dashboard)/dashboard/settings/actions';
import type { CrmVehicleRow } from '@/lib/crm-vehicles-db';

type Profile = {
  fullName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
};

function ResultMessage({ result }: { result: CustomerSettingsActionResult | null }) {
  if (!result) return null;
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`text-sm ${result.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
      {result.ok ? result.message : result.error}
    </p>
  );
}

export function CustomerProfileGaragePanel({
  initialProfile,
  initialVehicles,
}: {
  initialProfile: Profile;
  initialVehicles: CrmVehicleRow[];
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [newVehicle, setNewVehicle] = useState({ description: '', notes: '' });
  const [profileResult, setProfileResult] = useState<CustomerSettingsActionResult | null>(null);
  const [vehicleResult, setVehicleResult] = useState<CustomerSettingsActionResult | null>(null);
  const [saving, startSaving] = useTransition();

  const saveProfile = () => {
    setProfileResult(null);
    startSaving(async () => {
      setProfileResult(await updateCustomerProfileAction(profile));
    });
  };

  const addVehicle = () => {
    setVehicleResult(null);
    startSaving(async () => {
      const result = await addCustomerVehicleAction(newVehicle);
      setVehicleResult(result);
      if (result.ok) {
        setVehicles((rows) => [
          {
            id: `pending-${Date.now()}`,
            customer_id: '',
            description: newVehicle.description.trim(),
            notes: newVehicle.notes.trim() || null,
            created_at: new Date().toISOString(),
          },
          ...rows,
        ]);
        setNewVehicle({ description: '', notes: '' });
      }
    });
  };

  const saveVehicle = (vehicle: CrmVehicleRow) => {
    setVehicleResult(null);
    startSaving(async () => {
      setVehicleResult(
        await updateCustomerVehicleAction({
          vehicleId: vehicle.id,
          description: vehicle.description,
          notes: vehicle.notes ?? '',
        }),
      );
    });
  };

  return (
    <section id="garage" className="scroll-mt-28 space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-gold/20 bg-card p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft">
            <UserRound className="h-4 w-4" /> Your information
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Keep the contact and service details used for future bookings current.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">
              Full name
              <input className="gb-input mt-1 w-full" value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Email
              <input
                className="gb-input mt-1 w-full"
                type="email"
                autoComplete="email"
                value={profile.email}
                onChange={(event) => setProfile({ ...profile, email: event.target.value })}
              />
              <span className="mt-1 block text-[10px] font-normal">Changing email requires confirmation from your inbox.</span>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              Phone
              <input className="gb-input mt-1 w-full" type="tel" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">
              Street address
              <input className="gb-input mt-1 w-full" value={profile.addressLine1} onChange={(event) => setProfile({ ...profile, addressLine1: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground sm:col-span-2">
              Apartment, suite, or gate details
              <input className="gb-input mt-1 w-full" value={profile.addressLine2} onChange={(event) => setProfile({ ...profile, addressLine2: event.target.value })} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">
              City
              <input className="gb-input mt-1 w-full" value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-muted-foreground">
                State
                <input className="gb-input mt-1 w-full" value={profile.state} onChange={(event) => setProfile({ ...profile, state: event.target.value })} />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                ZIP
                <input className="gb-input mt-1 w-full" value={profile.postalCode} onChange={(event) => setProfile({ ...profile, postalCode: event.target.value })} />
              </label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" disabled={saving} onClick={saveProfile} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-5 text-xs font-black uppercase text-black disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save profile'}
            </button>
            <ResultMessage result={profileResult} />
          </div>
        </div>

        <div className="rounded-3xl border border-gold/20 bg-card p-5 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft">
            <Plus className="h-4 w-4" /> Add another vehicle
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Save the vehicle once and select it faster during your next booking.</p>
          <div className="mt-5 space-y-3">
            <label className="block text-xs font-semibold text-muted-foreground">
              Year, make, model, and trim
              <input
                className="gb-input mt-1 w-full"
                placeholder="2021 Ford F-150 Lariat"
                value={newVehicle.description}
                onChange={(event) => setNewVehicle({ ...newVehicle, description: event.target.value })}
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              Notes
              <textarea
                className="gb-input mt-1 w-full"
                rows={4}
                placeholder="Color, pet hair, child seats, access notes…"
                value={newVehicle.notes}
                onChange={(event) => setNewVehicle({ ...newVehicle, notes: event.target.value })}
              />
            </label>
          </div>
          <button type="button" disabled={saving || !newVehicle.description.trim()} onClick={addVehicle} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold px-5 text-xs font-black uppercase text-black disabled:opacity-50">
            <Car className="h-4 w-4" /> Add vehicle
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft"><Car className="h-4 w-4" /> Your garage</p>
            <p className="mt-2 text-sm text-muted-foreground">{vehicles.length ? `${vehicles.length} saved vehicle${vehicles.length === 1 ? '' : 's'}` : 'No saved vehicles yet.'}</p>
          </div>
          <ResultMessage result={vehicleResult} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {vehicles.map((vehicle, index) => (
            <article key={vehicle.id} className="rounded-2xl border border-border bg-muted/30 p-4">
              <label className="block text-xs font-semibold text-muted-foreground">
                Vehicle
                <input
                  className="gb-input mt-1 w-full"
                  value={vehicle.description}
                  onChange={(event) => setVehicles((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, description: event.target.value } : row))}
                />
              </label>
              <label className="mt-3 block text-xs font-semibold text-muted-foreground">
                Notes
                <textarea
                  className="gb-input mt-1 w-full"
                  rows={3}
                  value={vehicle.notes ?? ''}
                  onChange={(event) => setVehicles((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, notes: event.target.value } : row))}
                />
              </label>
              {vehicle.id.startsWith('pending-') ? (
                <p className="mt-3 text-xs text-emerald-600 dark:text-emerald-300">Saved. Refreshing the page will load the permanent record.</p>
              ) : (
                <button type="button" disabled={saving || !vehicle.description.trim()} onClick={() => saveVehicle(vehicle)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-gold/30 px-4 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50">
                  <Save className="h-3.5 w-3.5" /> Save vehicle
                </button>
              )}
            </article>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> Appointment-specific addresses and access notes can still be changed during booking.</p>
      </div>
    </section>
  );
}
