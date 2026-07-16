import { NextResponse, type NextRequest } from "next/server";
import { createFoodServiceDispositionsCollector } from "@/lib/collectors/food-service-dispositions";
import { runCollector } from "@/lib/collectors/run";
import type { Collector } from "@/lib/collectors/types";

// 소스별 독립 실행: 하나가 실패해도 나머지는 계속 진행한다(§8).
// 키가 없는 소스는 등록하지 않고 건너뛴다 — 현재는 식품접객업(I2630)만 구현되어 있고
// 나머지는 docs/data-sources.md의 필드 매핑 확정 후 추가한다.
function buildCollectors(): Collector[] {
  const collectors: Collector[] = [];

  const foodsafetyKoreaKey = process.env.FOODSAFETYKOREA_API_KEY;
  if (foodsafetyKoreaKey) {
    collectors.push(createFoodServiceDispositionsCollector(foodsafetyKoreaKey));
  }

  return collectors;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const collectors = buildCollectors();
  if (collectors.length === 0) {
    return NextResponse.json({ results: [], message: "등록된 수집기가 없습니다" });
  }

  const results = [];
  for (const collector of collectors) {
    results.push(await runCollector(collector));
  }

  return NextResponse.json({ results });
}
