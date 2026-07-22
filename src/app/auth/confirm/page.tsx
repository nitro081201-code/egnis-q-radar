"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INVALID_LINK_ERROR = "로그인 링크가 유효하지 않거나 만료되었습니다";

/**
 * 로그인 복귀 지점. 두 가지 방식을 모두 처리한다.
 *  - Google OAuth(PKCE)  → ?code=... 쿼리로 복귀 → exchangeCodeForSession
 *  - 이메일 매직링크(implicit) → #access_token=... 해시로 복귀 → setSession
 */
export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const url = new URL(window.location.href);

    const fail = (message: string) =>
      router.replace(`/login?error=${encodeURIComponent(message)}`);
    const done = (error: { message?: string } | null) =>
      error ? fail(INVALID_LINK_ERROR) : router.replace("/board");

    // 제공자가 거절한 경우(도메인 불일치·사용자 취소 등)는 쿼리로 사유가 온다.
    const queryError =
      url.searchParams.get("error_description") ?? url.searchParams.get("error");
    if (queryError) {
      fail(queryError);
      return;
    }

    const code = url.searchParams.get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => done(error));
      return;
    }

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashError = hash.get("error_description") ?? hash.get("error");
    if (hashError) {
      fail(hashError);
      return;
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) {
      fail(INVALID_LINK_ERROR);
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => done(error));
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <p className="text-sm text-gray-500">로그인 처리 중입니다...</p>
    </main>
  );
}
