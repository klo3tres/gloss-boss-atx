import { Suspense } from 'react';
import IntakeContent from './intake-content';

export default function IntakePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black px-4 pt-24 text-zinc-400">Loading intake form…</main>}>
      <IntakeContent />
    </Suspense>
  );
}
