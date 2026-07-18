"use client";

import { useRouter } from "next/navigation";

const PAGE_SIZES = [20, 40, 100];

export default function PageSizeSelect({
  current,
  type,
  category,
  risk,
  q,
}: {
  current: number;
  type: string;
  category: string;
  risk: string;
  q: string;
}) {
  const router = useRouter();

  return (
    <select
      value={current}
      aria-label="페이지당 표시 개수"
      style={{ colorScheme: "light" }}
      className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black"
      onChange={(e) => {
        const params = new URLSearchParams();
        if (type !== "all") params.set("type", type);
        if (category !== "all") params.set("category", category);
        if (risk !== "all") params.set("risk", risk);
        if (q) params.set("q", q);
        params.set("pageSize", e.target.value);
        const qs = params.toString();
        router.push(qs ? `/board?${qs}` : "/board");
      }}
    >
      {PAGE_SIZES.map((size) => (
        <option key={size} value={size}>
          {size}개씩 보기
        </option>
      ))}
    </select>
  );
}
