'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type IntakeField = { name: string; label: string; type?: string; required?: boolean };

export default function IntakeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const appointmentId = searchParams.get('appointment_id');
  const token = searchParams.get('token');
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [fields, setFields] = useState<IntakeField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!appointmentId || !token) {
      setError('Missing booking link parameters.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchWithTimeout(
      `/api/intake/form?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId ?? '')}`,
      { timeoutMs: 12000 },
    )
      .then((r) => r.json())
      .then((data: { ok?: boolean; error?: string; html?: string; fields?: IntakeField[]; alreadySubmitted?: boolean }) => {
        if (cancelled) return;
        if (!data.ok) {
          setError(data.error ?? 'Unable to load intake form');
          return;
        }
        if (data.alreadySubmitted) {
          setDone(true);
          return;
        }
        setHtml(data.html ?? null);
        setFields(data.fields ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load intake form');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appointmentId, token, sessionId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointmentId || !token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetchWithTimeout('/api/intake/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, token, sessionId, formData: values }),
        timeoutMs: 20000,
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setError(j.error ?? 'Submit failed');
        return;
      }
      setDone(true);
      router.push(
        `/agreement?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}&session_id=${encodeURIComponent(sessionId ?? '')}`,
      );
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="min-h-screen bg-black px-4 pt-24 text-zinc-400">Verifying payment and loading intake…</main>;
  }

  if (done && !error) {
    return (
      <main className="min-h-screen bg-black px-4 pt-24 text-white">
        <p className="text-sm text-emerald-300">Intake saved. Continue to liability acknowledgment…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 pb-16 pt-24 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-wider text-gold-soft">Post-checkout intake</p>
        <h1 className="mt-2 text-3xl font-black uppercase">Vehicle & service details</h1>
        <p className="mt-2 text-sm text-zinc-400">Required before your appointment is finalized.</p>

        {error ? <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p> : null}

        {html ? (
          <div className="prose prose-invert mt-6 max-w-none rounded-xl border border-white/10 bg-zinc-950 p-4 text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        ) : null}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {(fields.length > 0
            ? fields
            : [
                { name: 'vehicle_year_make_model', label: 'Year / Make / Model', required: true },
                { name: 'vehicle_color', label: 'Color', required: true },
                { name: 'parking_location', label: 'Service location (address)', required: true },
                { name: 'special_requests', label: 'Special requests', required: false },
              ]
          ).map((f) => (
            <label key={f.name} className="block text-xs text-zinc-400">
              {f.label}
              {f.required ? ' *' : ''}
              <input
                name={f.name}
                type={f.type ?? 'text'}
                required={Boolean(f.required)}
                value={values[f.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Submit & continue'}
          </button>
        </form>

        <Link href="/" className="mt-6 inline-block text-xs text-zinc-500 underline">
          Home
        </Link>
      </div>
    </main>
  );
}
