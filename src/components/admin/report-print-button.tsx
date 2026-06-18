'use client';

export function ReportPrintButton({ label = 'Print / Save PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-200 transition hover:border-white/30 hover:bg-white/5 hover:text-white"
    >
      {label}
    </button>
  );
}
