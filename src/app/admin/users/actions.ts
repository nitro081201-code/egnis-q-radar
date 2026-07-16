"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = ["admin", "editor", "viewer"];

export async function updateProfile(formData: FormData) {
  const id = formData.get("id") as string;
  const role = formData.get("role") as string;
  const isActive = formData.get("is_active") === "on";

  if (!id || !VALID_ROLES.includes(role)) {
    throw new Error("잘못된 요청입니다");
  }

  const supabase = await createClient();
  // RLS(profiles_update_admin_only)가 admin이 아니면 이 업데이트 자체를 거부한다.
  const { error } = await supabase
    .from("profiles")
    .update({ role, is_active: isActive })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/users");
}
