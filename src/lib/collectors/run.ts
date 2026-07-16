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

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from(collector.table)
        .upsert(rows, { onConflict: "source_key" });
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
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("collection_runs")
      .update({ finished_at: new Date().toISOString(), status: "failed", error_message: message })
      .eq("id", run.id);
    return { sourceName: collector.sourceName, status: "failed" as const, error: message };
  }
}
