'use client';

import { useState, useTransition } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { sendTwilioTestSmsAction } from '@/app/(dashboard)/admin/setup-center/twilio-test-actions';
import { useToast } from '@/components/ui/toast-provider';

export function TwilioTestSmsPanel({
  configured,
  trialLikely,
  lastResult,
}: {
  configured: boolean;
  trialLikely: boolean;
  lastResult?: string | null;
}) {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(lastResult ?? '');

  const sendTest = () => {
    startTransition(async () => {
      const res = await sendTwilioTestSmsAction(phone);
      if (res.error) {
        toast.error('Twilio test', res.error);
        setResult(res.error);
        return;
      }
      const line = [res.message, res.sid ? `SID: ${res.sid}` : '', res.detail].filter(Boolean).join(' · ');
      setResult(line);
      toast.success('Twilio test', res.message ?? 'Test SMS sent.');
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gold-soft" />
        <p className="text-xs font-black uppercase text-white">Twilio customer SMS test</p>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Status: {configured ? (trialLikely ? 'Configured — trial mode likely (verified numbers only)' : 'Configured — production ready unknown') : 'Not configured'}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Customer phone to test (5125551234)"
          className="flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
        />
        <button
          type="button"
          disabled={pending || !configured || !phone.trim()}
          onClick={sendTest}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {pending ? 'Sending…' : 'Send test SMS'}
        </button>
      </div>
      {result ? <p className="mt-3 text-[11px] text-zinc-400">{result}</p> : null}
      {trialLikely ? (
        <p className="mt-2 text-[10px] text-amber-300/80">
          Trial accounts can only SMS verified recipient numbers. Verify the test phone in Twilio Console or upgrade the account.
        </p>
      ) : null}
    </div>
  );
}
