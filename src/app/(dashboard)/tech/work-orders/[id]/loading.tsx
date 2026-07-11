export default function WorkOrderLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl animate-pulse space-y-5 px-4 py-6" aria-label="Loading work order">
      <div className="h-12 w-72 max-w-full rounded-xl bg-white/10" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 rounded-2xl bg-white/10 md:col-span-2" />
        <div className="h-32 rounded-2xl bg-white/10" />
      </div>
      <div className="h-56 rounded-2xl bg-white/10" />
      <div className="h-40 rounded-2xl bg-white/10" />
    </main>
  );
}
