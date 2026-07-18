"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DOMAIN = "egnis.kr";
const ALLOWED_EMAILS = ["nitro081201@gmail.com", "venosis0812@gmail.com"];

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
