import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const CONTENT_TABLES = ["dispositions", "recalls", "regulations"] as const;
const QUARANTINE_STATUSES = ["quarantined", "unverified"];

const TABLE_LABEL: Record<(typeof CONTENT_TABLES)[number], string> = {
  dispositions: "행정처분",
  recalls: "회수·판매중지",
  regulations: "법령·고시",
};

export default async function QuarantinePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile?.is_active || profile.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const counts = await Promise.all(
    CONTENT_TABLES.map(async (table) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .in("status", QUARANTINE_STATUSES);
      return { table, count: error ? null : (count ?? 0), error: error?.message };
    })
  );

  const total = counts.reduce((sum, c) => sum + (c.count ?? 0), 0);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">검수대상 현황</h1>
      <p className="mt-1 text-sm text-gray-500">
        데이터 품질 검수를 통과하지 못했거나(quarantined) 수동 등록 후 아직 검수되지
        않은(unverified) 건수입니다. 일반 사용자 화면에는 노출되지 않습니다.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {counts.map(({ table, count, error }) => (
          <div key={table} className="rounded-lg border p-4">
            <div className="text-sm text-gray-500">{TABLE_LABEL[table]}</div>
            <div className="mt-1 text-2xl font-semibold">
              {error ? "오류" : count}
            </div>
            {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
          </div>
        ))}
      </div>

      <div className="mt-6 text-sm text-gray-600">전체: {total}건</div>
    </main>
  );
}
