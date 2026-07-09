'use client';

import { useState } from 'react';
import type { CadenceRule } from '@/lib/customer-notification-cadence';
import { saveCadenceRuleAction } from '@/app/(dashboard)/admin/notifications/cadence-actions';

export function NotificationCadenceSettingsPanel({
  rules,
  tablesReady,
}: {
  rules: CadenceRule[];
  tablesReady: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(rules[0]?.ruleKey ?? null);

  if (!tablesReady) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
        Apply migration <span className="font-mono">000120</span> to enable notification cadence rules.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Customer notification cadence</p>
        <p className="mt-1 text-xs text-zinc-500">
          Welcome, reminders, post-service thank-you/referral/review, and rebook messages. SMS includes STOP language; sends respect opt-in.
        </p>
      </div>
      {rules.map((rule) => (
        <details
          key={rule.ruleKey}
          open={expanded === rule.ruleKey}
          onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open ? rule.ruleKey : null)}
          className="rounded-2xl border border-white/10 bg-black/40"
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-white">
            {rule.label}
            <span className={`ml-2 text-[10px] font-black uppercase ${rule.enabled ? 'text-emerald-300' : 'text-zinc-600'}`}>
              {rule.enabled ? 'On' : 'Off'}
            </span>
            {(rule.delayDays > 0 || rule.delayHours > 0) && (
              <span className="ml-2 text-[10px] text-zinc-500">
                +{rule.delayDays}d {rule.delayHours > 0 ? `+${rule.delayHours}h` : ''}
              </span>
            )}
          </summary>
          <form action={saveCadenceRuleAction} className="space-y-3 border-t border-white/8 px-4 py-4">
            <input type="hidden" name="rule_key" value={rule.ruleKey} />
            <input type="hidden" name="label" value={rule.label} />
            <input type="hidden" name="sort_order" value={rule.sortOrder} />
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2 text-zinc-300">
                <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="accent-[var(--gold)]" /> Enabled
              </label>
              <label className="flex items-center gap-2 text-zinc-300">
                <input type="checkbox" name="sms_enabled" defaultChecked={rule.smsEnabled} className="accent-[var(--gold)]" /> SMS
              </label>
              <label className="flex items-center gap-2 text-zinc-300">
                <input type="checkbox" name="email_enabled" defaultChecked={rule.emailEnabled} className="accent-[var(--gold)]" /> Email
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-zinc-500">
                Delay (days)
                <input type="number" name="delay_days" defaultValue={rule.delayDays} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-white" />
              </label>
              <label className="text-xs text-zinc-500">
                Delay (hours)
                <input type="number" name="delay_hours" defaultValue={rule.delayHours} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-white" />
              </label>
              <label className="text-xs text-zinc-500">
                Service filter
                <input name="service_type_filter" defaultValue={rule.serviceTypeFilter ?? ''} placeholder="exterior, ceramic…" className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-white" />
              </label>
            </div>
            <label className="block text-xs text-zinc-500">
              SMS template
              <textarea name="sms_template" defaultValue={rule.smsTemplate} rows={3} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-xs text-white" />
            </label>
            <label className="block text-xs text-zinc-500">
              Email subject
              <input name="email_subject" defaultValue={rule.emailSubject} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white" />
            </label>
            <label className="block text-xs text-zinc-500">
              Email body
              <textarea name="email_body" defaultValue={rule.emailBody} rows={4} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 font-mono text-xs text-white" />
            </label>
            <p className="text-[10px] text-zinc-600">Vars: {'{{customer}}'} {'{{book_link}}'} {'{{portal_link}}'} {'{{referral_link}}'} {'{{review_link}}'} {'{{time}}'} {'{{address}}'}</p>
            <button type="submit" className="rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black">
              Save rule
            </button>
          </form>
        </details>
      ))}
    </section>
  );
}
