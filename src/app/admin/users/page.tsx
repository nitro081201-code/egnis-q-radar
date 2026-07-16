import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateProfile } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "조회자",
};

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!myProfile?.is_active || myProfile.role !== "admin") {
    redirect("/login?error=관리자 권한이 필요합니다");
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, role, is_active, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-semibold">사용자 관리</h1>
      <p className="mt-1 text-sm text-gray-500">
        새로 로그인을 시도한 계정은 기본적으로 비활성 상태입니다. 활성화하고
        권한을 지정해야 데이터에 접근할 수 있습니다.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error.message}</p>}

      <div className="mt-6 divide-y divide-gray-300 rounded-lg border border-gray-300">
        {profiles?.map((p) => {
          const isSelf = p.id === user.id;
          return (
            <form
              key={p.id}
              action={updateProfile}
              className="flex flex-wrap items-center gap-3 p-4"
            >
              <input type="hidden" name="id" value={p.id} />
              <div className="min-w-[220px] flex-1">
                <div className="text-sm font-medium">{p.email}</div>
                <div className="text-xs text-gray-500">
                  가입: {new Date(p.created_at).toLocaleDateString("ko-KR")}
                  {isSelf && " · 본인 계정"}
                </div>
              </div>

              {isSelf ? (
                <span className="text-sm text-gray-500">
                  {ROLE_LABEL[p.role]} · {p.is_active ? "활성" : "비활성"} (본인 계정은
                  여기서 수정할 수 없습니다)
                </span>
              ) : (
                <>
                  <select
                    name="role"
                    defaultValue={p.role}
                    style={{ colorScheme: "light" }}
                    className="rounded border border-gray-400 bg-white px-2 py-1 text-sm text-black"
                  >
                    <option value="admin">관리자</option>
                    <option value="editor">편집자</option>
                    <option value="viewer">조회자</option>
                  </select>

                  <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" name="is_active" defaultChecked={p.is_active} />
                    활성화
                  </label>

                  <button
                    type="submit"
                    className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700"
                  >
                    저장
                  </button>
                </>
              )}
            </form>
          );
        })}

        {profiles?.length === 0 && (
          <p className="p-4 text-sm text-gray-500">사용자가 없습니다.</p>
        )}
      </div>
    </main>
  );
}
