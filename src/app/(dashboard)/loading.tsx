export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-surface-card" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-28 rounded-xl border border-border bg-surface-card"
          />
        ))}
      </div>
      <div className="h-72 rounded-xl border border-border bg-surface-card" />
    </div>
  );
}

