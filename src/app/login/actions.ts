"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_DOMAIN = "egnis.kr";
// 도메인(@egnis.kr) 외에 추가로 허용할 이메일은 환경변수로 관리한다.
// 개인 계정을 코드에 하드코딩하지 않는다. (예: LOGIN_ALLOWED_EMAILS="a@x.com,b@y.com")
const ALLOWED_EMAILS = (process.env.LOGIN_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isAllowedEmail(email: string) {
  const normalized = email.toLowerCase();
  return (
    normalized.endsWith(`@${ALLOWED_DOMAIN}`) ||
    ALLOWED_EMAILS.includes(normalized)
  );
}

export async function login(formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim();
  if (!email) {
    redirect("/login?error=이메일을 입력하세요");
  }

  if (!isAllowedEmail(email)) {
    redirect(
      `/login?error=${encodeURIComponent("사내 이메일(@egnis.kr)로만 가입할 수 있습니다")}`,
    );
  }

  // @supabase/ssr의 createServerClient는 flowType 옵션을 항상 "pkce"로 덮어써서
  // 무시한다 (node_modules/@supabase/ssr/src/createServerClient.ts) — 그러면 매직링크가
  // PKCE 코드(?code=)로 발급되어 요청한 기기의 code_verifier 쿠키가 없으면 항상 실패한다.
  // 다른 기기/브라우저에서 링크를 열 수 있으려면 순수 supabase-js 클라이언트로 OTP를
  // 요청해야 flowType: "implicit"이 실제로 적용되어 토큰이 URL 해시로 전달된다.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false } }
  );
  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${requestHeaders.get("x-forwarded-proto") ?? "http"}://${requestHeaders.get("host")}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=1");
}
