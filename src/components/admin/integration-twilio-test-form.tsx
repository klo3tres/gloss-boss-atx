'use client';

import { useMemo, useState } from 'react';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { checkTwilioMessageStatusAction, sendIntegrationTestAction } from '@/app/(dashboard)/admin/integrations/integration-actions';
import { normalizeToE164 } from '@/lib/us-phone';
import { describeTwilioDelivery } from '@/lib/twilio-delivery';

export function IntegrationTwilioTestForm({ lastSid }: { lastSid?: string | null }) {
  const [raw, setRaw] = useState('');
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const normalized = useMemo(() => {
    const v = raw.trim();
    if (!v) return null;
    return normalizeToE164(v);
  }, [raw]);

  async function refreshStatus() {
    const sid = lastSid?.trim();
    if (!sid) {
      setCheckResult('No Twilio SID on file — send a test SMS first.');
      return;
    }
    setChecking(true);
    setCheckResult(null);
    const res = await checkTwilioMessageStatusAction(sid);
    setChecking(false);
    if (!res.ok) {
      setCheckResult(res.error ?? 'Could not check status.');
      return;
    }
    const info = describeTwilioDelivery(res.status, {
      errorCode: res.errorCode,
      errorMessage: res.errorMessage,
      sid: res.sid,
    });
    setCheckResult(`${info.label}\n${info.detail}`);
  }

  return (
    <div className='space-y-3'>
      <ToastActionForm action={sendIntegrationTestAction} className='space-y-3'>
        <input type='hidden' name='kind' value='twilio_test' />
        <input type='hidden' name='destination' value={normalized?.ok ? normalized.e164 : ''} />
        <label className='block text-xs font-bold uppercase tracking-wider text-zinc-400'>
          Test SMS destination (US)
          <input
            name='destination_display'
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder='3097136143'
            autoComplete='tel'
            className='mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        {normalized?.ok ? (
          <p className='text-xs text-gold-soft'>
            Will send to: <span className='font-mono font-bold'>{normalized.e164}</span> ({normalized.display})
          </p>
        ) : raw.trim() ? (
          <p className='text-xs text-red-300'>{normalized && !normalized.ok ? normalized.error : 'Enter a valid number.'}</p>
        ) : null}
        <SubmitStatusButton
          pendingText='Sending…'
          disabled={!normalized?.ok}
          className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40'
        >
          Send Test SMS
        </SubmitStatusButton>
      </ToastActionForm>

      <div className='rounded-xl border border-white/10 bg-black/40 p-3'>
        <p className='text-xs font-bold uppercase tracking-wider text-zinc-400'>Check delivery status</p>
        {lastSid ? <p className='mt-1 font-mono text-[10px] text-zinc-500 break-all'>SID: {lastSid}</p> : null}
        <button
          type='button'
          disabled={checking || !lastSid}
          onClick={() => void refreshStatus()}
          className='mt-2 rounded-lg border border-gold/35 px-3 py-2 text-[10px] font-black uppercase text-gold-soft disabled:opacity-40'
        >
          {checking ? 'Checking…' : 'Refresh Twilio status'}
        </button>
        {checkResult ? <pre className='mt-2 whitespace-pre-wrap text-xs text-zinc-300'>{checkResult}</pre> : null}
      </div>
    </div>
  );
}
