import { createAdminClient } from "@/lib/supabase/admin";
import type { Collector } from "./types";

/**
 * 소스 하나를 실행하고 collection_runs에 기록한다. 실패해도 예외를 던지지 않고
 * 결과 객체로 반환한다 — 호출부(cron 라우트)가 소스별 독립 실행을 보장하기 위함(§8).
 */
export async function runCollector(collector: Collector) {
  const supabase = createAdminClient();

  const { data: run, error: runInsertError } = await supabase
    .from("collection_runs")
    .insert({ source_name: collector.sourceName, status: "partial" })
    .select("id")
    .single();

  if (runInsertError || !run) {
    return {
      sourceName: collector.sourceName,
      status: "failed" as const,
      error: `collection_runs 기록 실패: ${runInsertError?.message}`,
    };
  }

  try {
    const rows = await collector.collect();

    // 페이지네이션 도중 원본 데이터가 갱신되면 동일 source_key가 여러 페이지에 걸쳐
    // 중복 등장할 수 있다 (offset 기반 페이지네이션의 흔한 문제). 같은 배치 안에서
    // 같은 source_key를 두 번 UPDATE하면 Postgres upsert가 에러를 내므로 먼저 중복 제거.
    const dedupedRows = [...new Map(rows.map((r) => [r.source_key, r])).values()];

    if (dedupedRows.length > 0) {
      const { error: upsertError } = await supabase
        .from(collector.table)
        .upsert(dedupedRows, { onConflict: "source_key" });
      if (upsertError) throw upsertError;
    }

    await supabase
      .from("collection_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: "success",
        records_fetched: rows.length,
      })
      .eq("id", run.id);

    return { sourceName: collector.sourceName, status: "success" as const, fetched: rows.length };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    await supabase
      .from("collection_runs")
      .update({ finished_at: new Date().toISOString(), status: "failed", error_message: message })
      .eq("id", run.id);
    return { sourceName: collector.sourceName, status: "failed" as const, error: message };
  }
}
