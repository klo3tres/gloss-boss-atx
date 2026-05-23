'use client';

import { useFormStatus } from 'react-dom';

export function SubmitStatusButton({
  children,
  pendingText = 'Sending...',
  className,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button type='submit' disabled={pending || disabled} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}
