import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isVibeGateOnly } from "@/lib/auth-config";

export async function proxy(request: NextRequest) {
  // 게이트 전용 모드에는 앱 세션이 없다 — 매 요청마다 세션 갱신을 시도할 이유가 없다.
  if (isVibeGateOnly()) return NextResponse.next({ request });

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
