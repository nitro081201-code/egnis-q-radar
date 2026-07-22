"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GoogleLoginButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/confirm`,
        // hd: 회사 계정만 계정 선택창에 뜨게 하는 힌트(강제는 아님 —
        // 실제 접근 차단은 profiles 트리거의 사내 도메인 검사가 담당한다).
        queryParams: { hd: "egnis.kr", prompt: "select_account" },
      },
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
    // 성공 시 구글로 리다이렉트되므로 별도 처리 불필요.
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-gray-50 disabled:opacity-60"
      >
        {pending ? "이동 중..." : "회사 Google 계정으로 로그인"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
