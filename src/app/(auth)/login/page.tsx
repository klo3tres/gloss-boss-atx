import { Suspense } from 'react';
import { SafeRenderBoundary } from '@/components/ui/safe-render-boundary';
import LoginForm from './login-form';

function LoginFallback() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-background px-4 pb-16 pt-28 text-foreground'>
      <div className='w-full max-w-md rounded-2xl border border-gold/20 bg-zinc-950 p-6 text-center text-sm text-zinc-400'>Loading sign-in…</div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <SafeRenderBoundary label='Sign in'>
        <LoginForm />
      </SafeRenderBoundary>
    </Suspense>
  );
}
