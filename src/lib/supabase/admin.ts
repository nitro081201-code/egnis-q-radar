import { createClient } from "@supabase/supabase-js";

/**
 * service_role 클라이언트 — RLS를 우회한다. 수집 파이프라인(Cron)처럼
 * 서버 전용 배치 작업에서만 사용하고, 사용자 요청 경로에서는 절대 쓰지 않는다.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
