import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isVibeGateOnly } from "@/lib/auth-config";

export default async function Home() {
  // vibe 게이트 전용 모드에서는 앱 로그인이 없으므로 바로 board로 보낸다.
  if (isVibeGateOnly()) redirect("/board");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/board" : "/login");
}
