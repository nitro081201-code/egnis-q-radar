"use client";

export default function BoardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-xl font-semibold">EGNIS Q-Radar</h1>
      <p className="mt-6 text-sm text-red-600">
        보드를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-gray-400">오류 코드: {error.digest}</p>
      )}
      <button
        onClick={() => unstable_retry()}
        className="mt-4 rounded border border-gray-400 px-3 py-1 text-sm hover:bg-gray-100"
      >
        다시 시도
      </button>
    </main>
  );
}
