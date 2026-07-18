"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INVALID_LINK_ERROR = "로그인 링크가 유효하지 않거나 만료되었습니다";

export default function AuthConfirmPage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken || !refreshToken) {
      router.replace(`/login?error=${encodeURIComponent(INVALID_LINK_ERROR)}`);
      return;
    }

    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        router.replace(
          error ? `/login?error=${encodeURIComponent(INVALID_LINK_ERROR)}` : "/board"
        );
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <p className="text-sm text-gray-500">로그인 처리 중입니다...</p>
    </main>
  );
}
