'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Bell,
  Building2,
  Calendar,
  Cloud,
  CreditCard,
  Gift,
  Globe,
  Image,
  Palette,
  Share2,
  Star,
} from 'lucide-react';
import { AppearanceSettingsPanel } from '@/components/theme/appearance-settings-panel';
import { GoogleCalendarConnectPanel } from '@/components/admin/google-calendar-connect-panel';
import { NotificationSettingsPanel } from '@/components/admin/notification-settings-panel';
import { PushoverSetupPanel } from '@/components/admin/pushover-setup-panel';
import type { UserUiPreferences } from '@/lib/user-ui-preferences';

type Tab = 'general' | 'business' | 'notifications' | 'appearance';

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'General', icon: <Palette className="h-4 w-4" /> },
  { id: 'business', label: 'Business', icon: <Building2 className="h-4 w-4" /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
  { id: 'appearance', label: 'Appearance', icon: <Globe className="h-4 w-4" /> },
];

function SettingsLinkCard({
  href,
  title,
  desc,
  icon,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 transition hover:border-gold/30 hover:bg-black/55"
    >
      <span className="mt-0.5 text-gold-soft">{icon}</span>
      <div>
        <p className="text-sm font-black text-white">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{desc}</p>
      </div>
    </Link>
  );
}

export function AdminSettingsClient({
  uiPreferences,
  websiteDefault,
  isSuperAdmin,
  pushoverConfigured,
  notifyPrefs,
}: {
  uiPreferences: UserUiPreferences;
  websiteDefault: 'light' | 'dark';
  isSuperAdmin: boolean;
  pushoverConfigured: boolean;
  notifyPrefs: Parameters<typeof NotificationSettingsPanel>[0]['prefs'];
}) {
  const [tab, setTab] = useState<Tab>('general');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
              tab === t.id ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-400 hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <div className="space-y-4">
          <AppearanceSettingsPanel initial={uiPreferences} websiteDefault={websiteDefault} canEditSiteDefault={isSuperAdmin} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SettingsLinkCard href="/admin/brand-settings" title="Brand & logos" desc="Colors, hero video, logo URLs" icon={<Image className="h-4 w-4" />} />
            <SettingsLinkCard href="/admin/settings/stripe" title="Stripe payments" desc="Checkout keys and webhook" icon={<CreditCard className="h-4 w-4" />} />
          </div>
        </div>
      )}

      {tab === 'business' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsLinkCard href="/admin/setup-center" title="Business profile" desc="Owner name, email, phone" icon={<Building2 className="h-4 w-4" />} />
          <SettingsLinkCard href="/admin/cms?tab=hours" title="Social & review links" desc="Instagram, Google review URL" icon={<Share2 className="h-4 w-4" />} />
          <SettingsLinkCard href="/admin/referrals" title="Referral program" desc="Give/get rewards and ladder" icon={<Gift className="h-4 w-4" />} />
          <SettingsLinkCard href="/admin/memberships" title="Membership plans" desc="Bronze, Silver, Gold benefits" icon={<Star className="h-4 w-4" />} />
          <SettingsLinkCard href="/admin/integrations#weather" title="Weather" desc="OpenWeather API for readiness" icon={<Cloud className="h-4 w-4" />} />
          <SettingsLinkCard href="/admin/media-studio" title="Media Studio" desc="Unified asset manager" icon={<Image className="h-4 w-4" />} />
        </div>
      )}

      {tab === 'notifications' && (
        <div className="space-y-4">
          <NotificationSettingsPanel prefs={notifyPrefs} />
          <PushoverSetupPanel configured={pushoverConfigured} />
          <GoogleCalendarConnectPanel returnTo="/admin/settings" />
          <SettingsLinkCard href="/admin/integrations" title="Email & SMS integrations" desc="Twilio, Resend, maps" icon={<Bell className="h-4 w-4" />} />
        </div>
      )}

      {tab === 'appearance' && (
        <AppearanceSettingsPanel initial={uiPreferences} websiteDefault={websiteDefault} canEditSiteDefault={isSuperAdmin} />
      )}
    </div>
  );
}
