import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PageSizeSelect from "./page-size-select";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "통합 모니터링 보드",
};

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

const PAGE_SIZES = [20, 40, 100];
const DEFAULT_PAGE_SIZE = 20;
// 최근 수집 성공이 이 시간을 넘으면 "데이터가 오래됨"으로 간주(경고 배너).
const STALE_MS = 26 * 60 * 60 * 1000;

type SearchParams = {
  type?: string;
  category?: string;
  risk?: string;
  q?: string;
  page?: string;
  pageSize?: string;
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
  registered_date: string | null;
}

interface CollectionRun {
  source_name: string;
  status: string | null;
  finished_at: string | null;
  started_at: string | null;
}

// 두 목록(행정처분/회수)을 하나의 최신순 피드로 합치기 위한 래퍼.
type FeedItem =
  | { kind: "disposition"; sortDate: string | null; data: DispositionRow }
  | { kind: "recall"; sortDate: string | null; data: RecallRow };

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const {
    type = "all",
    category = "all",
    risk = "all",
    q = "",
    page: pageParam,
    pageSize: pageSizeParam,
  } = await searchParams;

  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam))
    ? Number(pageSizeParam)
    : DEFAULT_PAGE_SIZE;
  const requestedPage = Math.max(1, Number(pageParam) || 1);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active, role")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active)
    redirect("/login?error=계정이 아직 활성화되지 않았습니다");
  const isAdmin = profile.role === "admin";

  const includeDispositions = type !== "recall";
  const includeRecalls = type !== "disposition";

  // 1) 총 건수(페이지네이션용) + 수집 이력
  const [dispositionsCountResult, recallsCountResult, runsResult] =
    await Promise.all([
      includeDispositions
        ? (async () => {
            let query = supabase
              .from("dispositions")
              .select("id", { count: "exact", head: true })
              .eq("status", "published")
              .eq("visibility_status", "visible");
            if (category !== "all") query = query.eq("category", category);
            if (risk !== "all") query = query.eq("risk_level", risk);
            if (q) query = query.ilike("company_name", `%${q}%`);
            return query;
          })()
        : Promise.resolve({ count: 0, error: null }),
      includeRecalls
        ? (async () => {
            let query = supabase
              .from("recalls")
              .select("id", { count: "exact", head: true })
              .eq("status", "published");
            if (category !== "all") query = query.eq("category", category);
            if (risk !== "all") query = query.eq("risk_level", risk);
            if (q)
              query = query.or(
                `product_name.ilike.%${q}%,company_name.ilike.%${q}%`,
              );
            return query;
          })()
        : Promise.resolve({ count: 0, error: null }),
      supabase
        .from("collection_runs")
        .select("source_name, status, finished_at, started_at")
        .order("started_at", { ascending: false })
        .limit(30),
    ]);

  const dispositionsTotal = includeDispositions
    ? dispositionsCountResult.count ?? 0
    : 0;
  const recallsTotal = includeRecalls ? recallsCountResult.count ?? 0 : 0;
  const total = dispositionsTotal + recallsTotal;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = (currentPage - 1) * pageSize;

  // 2) 통합 최신순 피드
  //    각 표에서 "현재 페이지까지 필요한 만큼(currentPage*pageSize)"을 날짜 내림차순으로 넉넉히
  //    가져온 뒤, 두 목록을 날짜 기준으로 병합·정렬하고 현재 페이지 구간만 잘라낸다.
  //    (전역 상위 K건은 각 표의 상위 K건 안에 반드시 포함되므로 페이지 정합성이 보장된다)
  const fetchLimit = currentPage * pageSize;

  const [dispositionsResult, recallsResult] = await Promise.all([
    includeDispositions
      ? (async () => {
          let query = supabase
            .from("dispositions")
            .select(
              "id, category, company_name, violation_law, disposition_date, disposition_detail, disposition_agency, risk_level, source_url",
            )
            .eq("status", "published")
            .eq("visibility_status", "visible");
          if (category !== "all") query = query.eq("category", category);
          if (risk !== "all") query = query.eq("risk_level", risk);
          if (q) query = query.ilike("company_name", `%${q}%`);
          return query
            .order("disposition_date", { ascending: false, nullsFirst: false })
            .limit(fetchLimit);
        })()
      : Promise.resolve({ data: [] as DispositionRow[], error: null }),
    includeRecalls
      ? (async () => {
          let query = supabase
            .from("recalls")
            .select(
              "id, category, product_name, company_name, recall_reason, recall_grade_normalized, risk_level, source_url, registered_date",
            )
            .eq("status", "published");
          if (category !== "all") query = query.eq("category", category);
          if (risk !== "all") query = query.eq("risk_level", risk);
          if (q)
            query = query.or(
              `product_name.ilike.%${q}%,company_name.ilike.%${q}%`,
            );
          return query
            .order("registered_date", { ascending: false, nullsFirst: false })
            .limit(fetchLimit);
        })()
      : Promise.resolve({ data: [] as RecallRow[], error: null }),
  ]);

  const dispositions = (dispositionsResult.data ?? []) as DispositionRow[];
  const recalls = (recallsResult.data ?? []) as RecallRow[];

  const merged: FeedItem[] = [
    ...dispositions.map(
      (d): FeedItem => ({
        kind: "disposition",
        sortDate: d.disposition_date,
        data: d,
      }),
    ),
    ...recalls.map(
      (r): FeedItem => ({
        kind: "recall",
        sortDate: r.registered_date,
        data: r,
      }),
    ),
  ];
  merged.sort((a, b) => {
    // 날짜 내림차순, 날짜 없는 항목은 뒤로
    if (!a.sortDate && !b.sortDate) return 0;
    if (!a.sortDate) return 1;
    if (!b.sortDate) return -1;
    return a.sortDate < b.sortDate ? 1 : a.sortDate > b.sortDate ? -1 : 0;
  });
  const pageItems = merged.slice(rangeStart, rangeStart + pageSize);

  const hasError = Boolean(
    dispositionsCountResult.error ||
      recallsCountResult.error ||
      dispositionsResult.error ||
      recallsResult.error,
  );

  // 3) 수집 상태 집계 — 소스별 "가장 최근 실행"만 남겨 실패/신선도 판단
  const runs = (runsResult.data ?? []) as CollectionRun[];
  const latestBySource = new Map<string, CollectionRun>();
  for (const run of runs) {
    if (!latestBySource.has(run.source_name))
      latestBySource.set(run.source_name, run);
  }
  const failedSources = [...latestBySource.values()].filter(
    (r) => r.status === "failed",
  );
  const lastSuccess =
    runs.find((r) => r.status === "success" && r.finished_at) ?? null;
  const lastSuccessMs = lastSuccess?.finished_at
    ? new Date(lastSuccess.finished_at).getTime()
    : null;
  const isStale =
    lastSuccessMs != null && Date.now() - lastSuccessMs > STALE_MS;
  const showWarning = failedSources.length > 0 || isStale || !lastSuccess;

  function pageHref(targetPage: number) {
    const sp = new URLSearchParams();
    if (type !== "all") sp.set("type", type);
    if (category !== "all") sp.set("category", category);
    if (risk !== "all") sp.set("risk", risk);
    if (q) sp.set("q", q);
    if (pageSize !== DEFAULT_PAGE_SIZE) sp.set("pageSize", String(pageSize));
    if (targetPage !== 1) sp.set("page", String(targetPage));
    const qs = sp.toString();
    return qs ? `/board?${qs}` : "/board";
  }

  const rangeLabel =
    total === 0
      ? "0건"
      : `${rangeStart + 1}-${rangeStart + pageItems.length}건 / 총 ${total}건`;

  return (
    <main className="mx-auto max-w-5xl p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">EGNIS Q-Radar</h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          {isAdmin && (
            <>
              <a href="/admin/users" className="underline">
                사용자 관리
              </a>
              <a href="/admin/quarantine" className="underline">
                검수대상 현황
              </a>
            </>
          )}
          <span>
            {lastSuccess?.finished_at
              ? `최근 동기화: ${new Date(lastSuccess.finished_at).toLocaleString("ko-KR")} · 정상`
              : "아직 수집 이력 없음"}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded border border-gray-400 px-2 py-0.5 text-gray-600 hover:bg-gray-100"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>

      {/* 수집 실패·지연 경고 배너 */}
      {showWarning && (
        <div className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm text-white">
          ⚠️ 최근 수집에 문제가 있어 일부 데이터가 최신이 아닐 수 있습니다.
          {failedSources.length > 0 &&
            ` (실패: ${failedSources.map((s) => s.source_name).join(", ")})`}
          {isStale &&
            lastSuccess?.finished_at &&
            ` 마지막 정상 수집: ${new Date(lastSuccess.finished_at).toLocaleString("ko-KR")}.`}
          {" 중요한 판단 시 공식 원문을 확인하세요."}
        </div>
      )}

      <form className="mt-6 flex flex-wrap gap-3 border-b pb-4" method="get">
        <input type="hidden" name="pageSize" value={pageSize} />
        <select
          name="type"
          defaultValue={type}
          aria-label="구분"
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
          aria-label="분야"
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
          aria-label="위험도"
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
          aria-label="업체명·제품명 검색"
          style={{ colorScheme: "light" }}
          className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black placeholder:text-gray-400"
        />
        <button
          type="submit"
          className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
        >
          검색
        </button>
      </form>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {pageItems.map((item) =>
          item.kind === "disposition" ? (
            <article key={`d-${item.data.id}`} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  [행정처분]{" "}
                  {CATEGORY_LABEL[item.data.category] ?? item.data.category}
                </span>
                {item.data.risk_level && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_BADGE_CLASS[item.data.risk_level] ?? ""}`}
                  >
                    {RISK_LABEL[item.data.risk_level] ?? item.data.risk_level}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm">
                {item.data.company_name}은(는){" "}
                {item.data.violation_law ?? "관련 법령"} 위반으로{" "}
                {item.data.disposition_date ?? "미상"}{" "}
                {item.data.disposition_detail ?? "처분"} 처분을 받았습니다.
                처분기관: {item.data.disposition_agency ?? "미상"}
              </p>
              {item.data.source_url && (
                <a
                  href={item.data.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-blue-600 underline"
                >
                  공식 원문
                </a>
              )}
            </article>
          ) : (
            <article key={`r-${item.data.id}`} className="rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  [회수]{" "}
                  {CATEGORY_LABEL[item.data.category] ?? item.data.category}
                </span>
                {item.data.risk_level && (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${RISK_BADGE_CLASS[item.data.risk_level] ?? ""}`}
                  >
                    {RISK_LABEL[item.data.risk_level] ?? item.data.risk_level}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm">
                {item.data.product_name}({item.data.company_name})이{" "}
                {item.data.recall_reason ?? "품질 문제"}(으)로{" "}
                {item.data.recall_grade_normalized ?? "미분류"} 회수
                조치되었습니다.
              </p>
              {item.data.source_url && (
                <a
                  href={item.data.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs text-blue-600 underline"
                >
                  공식 원문
                </a>
              )}
            </article>
          ),
        )}

        {hasError && (
          <p className="text-sm text-red-600">
            데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        )}
        {!hasError && pageItems.length === 0 && (
          <p className="text-sm text-gray-500">조건에 맞는 항목이 없습니다.</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
        <div className="flex items-center gap-3 text-gray-600">
          <span>{rangeLabel}</span>
          <PageSizeSelect
            current={pageSize}
            type={type}
            category={category}
            risk={risk}
            q={q}
          />
        </div>
        <div className="flex items-center gap-2">
          {currentPage > 1 ? (
            <a
              href={pageHref(currentPage - 1)}
              className="rounded border border-gray-400 px-3 py-1 hover:bg-gray-100"
            >
              이전
            </a>
          ) : (
            <span className="rounded border border-gray-200 px-3 py-1 text-gray-300">
              이전
            </span>
          )}
          <span className="px-2 text-gray-600">
            {currentPage} / {totalPages}
          </span>
          {currentPage < totalPages ? (
            <a
              href={pageHref(currentPage + 1)}
              className="rounded border border-gray-400 px-3 py-1 hover:bg-gray-100"
            >
              다음
            </a>
          ) : (
            <span className="rounded border border-gray-200 px-3 py-1 text-gray-300">
              다음
            </span>
          )}
        </div>
      </div>

      <p className="mt-8 border-t pt-4 text-xs text-gray-500">
        본 데이터는 식약처 공공데이터 기준이며, 취소·취하된 처분 등 일부 건이
        누락될 수 있습니다. 법적 판단 시 반드시 공식 원문을 확인하십시오.
      </p>
    </main>
  );
}
