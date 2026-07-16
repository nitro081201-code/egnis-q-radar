import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  food: "식품",
  health_functional: "건강기능식품",
  imported_food: "수입식품",
  cosmetic: "화장품",
};

const RISK_LABEL: Record<string, string> = {
  critical: "심각",
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const RISK_BADGE_CLASS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-400 text-black",
  low: "bg-gray-300 text-black",
};

type SearchParams = {
  type?: string;
  category?: string;
  risk?: string;
  q?: string;
};

interface DispositionRow {
  id: string;
  category: string;
  company_name: string;
  violation_law: string | null;
  disposition_date: string | null;
  disposition_detail: string | null;
  disposition_agency: string | null;
  risk_level: string | null;
  source_url: string | null;
}

interface RecallRow {
  id: string;
  category: string;
  product_name: string;
  company_name: string;
  recall_reason: string | null;
  recall_grade_normalized: string | null;
  risk_level: string | null;
  source_url: string | null;
}

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { type = "all", category = "all", risk = "all", q = "" } = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active) redirect("/login?error=계정이 아직 활성화되지 않았습니다");

  const [dispositionsResult, recallsResult, lastRunResult] = await Promise.all([
    type === "recall"
      ? Promise.resolve({ data: [] as DispositionRow[], error: null })
      : (async () => {
          let query = supabase
            .from("dispositions")
            .select(
              "id, category, company_name, violation_law, disposition_date, disposition_detail, disposition_agency, risk_level, source_url"
            )
            .eq("status", "published")
            .eq("visibility_status", "visible")
            .order("disposition_date", { ascending: false })
            .limit(30);
          if (category !== "all") query = query.eq("category", category);
          if (risk !== "all") query = query.eq("risk_level", risk);
          if (q) query = query.ilike("company_name", `%${q}%`);
          return query;
        })(),
    type === "disposition"
      ? Promise.resolve({ data: [] as RecallRow[], error: null })
      : (async () => {
          let query = supabase
            .from("recalls")
            .select(
              "id, category, product_name, company_name, recall_reason, recall_grade_normalized, risk_level, source_url"
            )
            .eq("status", "published")
            .order("registered_date", { ascending: false })
            .limit(30);
          if (category !== "all") query = query.eq("category", category);
          if (risk !== "all") query = query.eq("risk_level", risk);
          if (q)
            query = query.or(`product_name.ilike.%${q}%,company_name.ilike.%${q}%`);
          return query;
        })(),
    supabase
      .from("collection_runs")
      .select("source_name, status, finished_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const dispositions = (dispositionsResult.data ?? []) as DispositionRow[];
  const recalls = (recallsResult.data ?? []) as RecallRow[];
  const lastRun = lastRunResult.data;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">EGNIS Q-Radar</h1>
        <div className="text-xs text-gray-500">
          {lastRun
            ? `최근 동기화: ${new Date(lastRun.finished_at ?? "").toLocaleString("ko-KR")} · ${lastRun.status === "success" ? "정상" : lastRun.status === "failed" ? "실패" : "진행중"}`
            : "아직 수집 이력 없음"}
        </div>
      </div>

      <form className="mt-6 flex flex-wrap gap-3 border-b pb-4" method="get">
        <select
          name="type"
          defaultValue={type}
          style={{ colorScheme: "light" }}
          className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black"
        >
          <option value="all">전체</option>
          <option value="disposition">행정처분</option>
          <option value="recall">회수·판매중지</option>
        </select>
        <select
          name="category"
          defaultValue={category}
          style={{ colorScheme: "light" }}
          className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black"
        >
          <option value="all">전 분야</option>
          <option value="food">식품</option>
          <option value="health_functional">건강기능식품</option>
          <option value="imported_food">수입식품</option>
          <option value="cosmetic">화장품</option>
        </select>
        <select
          name="risk"
          defaultValue={risk}
          style={{ colorScheme: "light" }}
          className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black"
        >
          <option value="all">전체 위험도</option>
          <option value="critical">심각</option>
          <option value="high">높음</option>
          <option value="medium">보통</option>
          <option value="low">낮음</option>
        </select>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="업체명·제품명 검색"
          style={{ colorScheme: "light" }}
          className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black placeholder:text-gray-400"
        />
        <button type="submit" className="rounded bg-black px-3 py-1 text-sm text-white">
          검색
        </button>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {dispositions.map((d) => (
          <article key={d.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                [행정처분] {CATEGORY_LABEL[d.category] ?? d.category}
              </span>
              {d.risk_level && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_BADGE_CLASS[d.risk_level] ?? ""}`}
                >
                  {RISK_LABEL[d.risk_level] ?? d.risk_level}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm">
              {d.company_name}은(는) {d.violation_law ?? "관련 법령"} 위반으로{" "}
              {d.disposition_date ?? "미상"} {d.disposition_detail ?? "처분"} 처분을
              받았습니다. 처분기관: {d.disposition_agency ?? "미상"}
            </p>
            {d.source_url && (
              <a
                href={d.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 underline"
              >
                공식 원문
              </a>
            )}
          </article>
        ))}

        {recalls.map((r) => (
          <article key={r.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                [회수] {CATEGORY_LABEL[r.category] ?? r.category}
              </span>
              {r.risk_level && (
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_BADGE_CLASS[r.risk_level] ?? ""}`}
                >
                  {RISK_LABEL[r.risk_level] ?? r.risk_level}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm">
              {r.product_name}({r.company_name})이 {r.recall_reason ?? "품질 문제"}
              (으)로 {r.recall_grade_normalized ?? "미분류"} 회수 조치되었습니다.
            </p>
            {r.source_url && (
              <a
                href={r.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-blue-600 underline"
              >
                공식 원문
              </a>
            )}
          </article>
        ))}

        {dispositions.length === 0 && recalls.length === 0 && (
          <p className="text-sm text-gray-500">조건에 맞는 항목이 없습니다.</p>
        )}
      </div>

      <p className="mt-8 border-t pt-4 text-xs text-gray-500">
        본 데이터는 식약처 공공데이터 기준이며, 취소·취하된 처분 등 일부 건이 누락될 수
        있습니다. 법적 판단 시 반드시 공식 원문을 확인하십시오.
      </p>
    </main>
  );
}
