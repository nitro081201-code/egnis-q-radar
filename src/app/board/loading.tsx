export default function BoardLoading() {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">EGNIS Q-Radar</h1>
      </div>

      <div className="mt-6 flex flex-wrap gap-3 border-b pb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 animate-pulse rounded bg-gray-200" />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-gray-100" />
        ))}
      </div>
    </main>
  );
}
