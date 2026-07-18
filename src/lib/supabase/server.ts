import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // 로그인 이메일을 요청한 기기와 링크를 클릭하는 기기가 다른 경우가 흔해
      // PKCE(코드 검증 쿠키 필요) 대신 implicit 플로우를 사용한다.
      auth: { flowType: "implicit" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출된 경우 무시 — 세션 갱신은 middleware가 담당한다.
          }
        },
      },
    }
  );
}
