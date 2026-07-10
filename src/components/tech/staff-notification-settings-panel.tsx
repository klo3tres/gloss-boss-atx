'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { Bell, Mail, MessageSquare, Smartphone, Send } from 'lucide-react';
import type { StaffNotificationPreferences } from '@/lib/staff-notification-preferences';
import {
  saveStaffNotificationPreferencesAction,
  sendStaffNotificationTestAction,
} from '@/app/(dashboard)/tech/settings/actions';
import { useToast } from '@/components/ui/toast-provider';

type Props = {
  initialPrefs: StaffNotificationPreferences;
  initialPhone: string;
  initialEmail: string;
  initialPushoverKey: string;
  pushConfigured: boolean;
  vapidPublicKey: string | null;
  twilioConfigured?: boolean;
  resendConfigured?: boolean;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function StaffNotificationSettingsPanel({
  initialPrefs,
  initialPhone,
  initialEmail,
  initialPushoverKey,
  pushConfigured,
  vapidPublicKey,
  twilioConfigured = true,
  resendConfigured = true,
}: Props) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState(initialPrefs);
  const [phone, setPhone] = useState(initialPhone);
  const [pushoverKey, setPushoverKey] = useState(initialPushoverKey);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushPending, setPushPending] = useState(false);

  const checkPushSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) {
        setPushSubscribed(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setPushSubscribed(Boolean(sub));
    } catch {
      setPushSubscribed(false);
    }
  }, []);

  useEffect(() => {
    void checkPushSubscription();
  }, [checkPushSubscription]);

  const toggle = (key: keyof StaffNotificationPreferences) => {
    if (typeof prefs[key] === 'boolean') {
      setPrefs((s) => ({ ...s, [key]: !s[key] }));
    }
  };

  const save = () => {
    startTransition(async () => {
      const res = await saveStaffNotificationPreferencesAction(prefs, phone, pushoverKey);
      if (res.error) toast.error('Could not save', res.error);
      else toast.success('Saved', res.message ?? 'Notification preferences updated.');
    });
  };

  const sendTest = () => {
    startTransition(async () => {
      const res = await sendStaffNotificationTestAction();
      if (res.error) toast.error('Test failed', res.error);
      else toast.success('Test sent', res.message ?? 'Check your devices.');
    });
  };

  const enableBrowserPush = async () => {
    if (!vapidPublicKey) {
      toast.error('Push not configured', 'Ask admin to add VAPID keys in production env.');
      return;
    }
    setPushPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Permission denied', 'Allow notifications in your browser settings.');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Subscribe failed');
      }
      setPushSubscribed(true);
      toast.success('Push enabled', 'You will receive job alerts on this device.');
    } catch (e) {
      toast.error('Push setup failed', e instanceof Error ? e.message : 'Could not subscribe.');
    } finally {
      setPushPending(false);
    }
  };

  const disableBrowserPush = async () => {
    setPushPending(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (!reg) {
        setPushSubscribed(false);
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPushSubscribed(false);
      toast.success('Push disabled', 'Browser alerts turned off for this device.');
    } catch (e) {
      toast.error('Could not unsubscribe', e instanceof Error ? e.message : 'Try again.');
    } finally {
      setPushPending(false);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='rounded-2xl border border-gold/20 bg-card/40 p-5'>
        <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
          <Bell className='h-4 w-4' /> Contact for alerts
        </p>
        <p className='mt-2 text-sm text-muted-foreground'>
          Job dispatch uses your phone and email on file. Keep these accurate for Twilio SMS and Resend email.
        </p>
        <div className='mt-4 grid gap-4 sm:grid-cols-2'>
          <label className='text-xs text-muted-foreground'>
            <span className='flex items-center gap-1.5 font-bold uppercase tracking-wider text-foreground'>
              <Mail className='h-3 w-3' /> Email
            </span>
            <input
              type='email'
              value={initialEmail}
              readOnly
              className='mt-1.5 w-full rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-muted-foreground'
            />
            <span className='mt-1 block text-[10px]'>From your login account</span>
          </label>
          <label className='text-xs text-muted-foreground'>
            <span className='flex items-center gap-1.5 font-bold uppercase tracking-wider text-foreground'>
              <MessageSquare className='h-3 w-3' /> Mobile (SMS)
            </span>
            <input
              type='tel'
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder='5125551234'
              className='mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground'
            />
            <span className='mt-1 block text-[10px]'>
              {twilioConfigured ? 'US numbers — used for job dispatch texts' : 'Twilio not configured on server'}
            </span>
          </label>
        </div>
      </div>

      <div className='rounded-2xl border border-border bg-card/40 p-5 space-y-5'>
        <div>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Alert channels</p>
          <div className='mt-3 grid gap-2 sm:grid-cols-2'>
            {[
              ['notifyEmailEnabled', 'Email alerts', resendConfigured],
              ['notifySmsEnabled', 'SMS alerts (Twilio)', twilioConfigured],
              ['notifyPushEnabled', 'Browser / phone push', pushConfigured || Boolean(pushoverKey)],
              ['notifyInAppEnabled', 'In-app job feed', true],
            ].map(([key, label, available]) => (
              <label
                key={String(key)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs ${available ? 'border-border text-foreground' : 'border-border/50 text-muted-foreground opacity-60'}`}
              >
                <input
                  type='checkbox'
                  checked={Boolean(prefs[key as keyof StaffNotificationPreferences])}
                  disabled={!available}
                  onChange={() => toggle(key as keyof StaffNotificationPreferences)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground'>Notify me when</p>
          <div className='mt-3 grid gap-2 sm:grid-cols-2'>
            {[
              ['notifyJobAssigned', 'Job assigned to me'],
              ['notifyNewBookingAssigned', 'New booking on my calendar'],
              ['notifyJobRescheduled', 'Schedule change'],
              ['notifyJobCancelled', 'Job cancelled'],
            ].map(([key, label]) => (
              <label key={String(key)} className='flex items-center gap-2 text-xs text-muted-foreground'>
                <input
                  type='checkbox'
                  checked={Boolean(prefs[key as keyof StaffNotificationPreferences])}
                  onChange={() => toggle(key as keyof StaffNotificationPreferences)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className='grid gap-3 sm:grid-cols-2'>
          <label className='text-xs text-muted-foreground'>
            Quiet hours start
            <input
              type='time'
              value={prefs.quietHoursStart ?? ''}
              onChange={(e) => setPrefs((s) => ({ ...s, quietHoursStart: e.target.value || null }))}
              className='mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground'
            />
          </label>
          <label className='text-xs text-muted-foreground'>
            Quiet hours end
            <input
              type='time'
              value={prefs.quietHoursEnd ?? ''}
              onChange={(e) => setPrefs((s) => ({ ...s, quietHoursEnd: e.target.value || null }))}
              className='mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground'
            />
          </label>
        </div>
      </div>

      <div className='rounded-2xl border border-border bg-card/40 p-5'>
        <p className='flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>
          <Smartphone className='h-4 w-4' /> Browser push (recommended)
        </p>
        <p className='mt-2 text-sm text-muted-foreground'>
          Get instant job alerts on your phone or laptop — no app install. Tap enable on each device you use in the field.
        </p>
        {pushConfigured ? (
          <div className='mt-4 flex flex-wrap gap-2'>
            {pushSubscribed ? (
              <button
                type='button'
                disabled={pushPending}
                onClick={() => void disableBrowserPush()}
                className='rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase text-muted-foreground'
              >
                Disable on this device
              </button>
            ) : (
              <button
                type='button'
                disabled={pushPending}
                onClick={() => void enableBrowserPush()}
                className='rounded-xl bg-gold px-4 py-2.5 text-xs font-black uppercase text-black'
              >
                {pushPending ? 'Enabling…' : 'Enable browser push'}
              </button>
            )}
            {pushSubscribed ? (
              <span className='self-center text-xs text-emerald-400 font-semibold'>Active on this device</span>
            ) : null}
          </div>
        ) : (
          <p className='mt-3 text-xs text-amber-200/90'>
            Web push needs VAPID keys in production. Use SMS + email below, or add your Pushover user key for phone app push.
          </p>
        )}

        <label className='mt-4 block text-xs text-muted-foreground'>
          Pushover user key (optional — install Pushover app)
          <input
            type='text'
            value={pushoverKey}
            onChange={(e) => setPushoverKey(e.target.value)}
            placeholder='uQiRzpo4DXghDmr9QzzfQu'
            className='mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-xs text-foreground'
          />
        </label>
      </div>

      <div className='flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={pending}
          onClick={save}
          className='rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black disabled:opacity-50'
        >
          {pending ? 'Saving…' : 'Save preferences'}
        </button>
        <button
          type='button'
          disabled={pending}
          onClick={sendTest}
          className='inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 px-5 py-2.5 text-xs font-black uppercase text-emerald-200 disabled:opacity-50'
        >
          <Send className='h-3.5 w-3.5' />
          Send test alert
        </button>
      </div>
    </div>
  );
}
