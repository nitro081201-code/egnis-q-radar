"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = (formData.get("email") as string | null)?.trim();
  if (!email) {
    redirect("/login?error=이메일을 입력하세요");
  }

  const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!allowedEmails.includes(email.toLowerCase())) {
    // 공개 회원가입 금지 원칙(§profiles 마이그레이션 주석) — 목록에 없는 이메일은
    // 계정 존재 여부를 노출하지 않도록 발송 성공과 동일한 화면을 보여준다.
    redirect("/login?sent=1");
  }

  const supabase = await createClient();
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
