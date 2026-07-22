import { login } from "./actions";
import { isMagicLinkEnabled } from "@/lib/auth-config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  const magicLinkEnabled = isMagicLinkEnabled();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="text-lg font-semibold">EGNIS Q-Radar 로그인</h1>
      <p className="mt-1 text-sm text-gray-500">
        {magicLinkEnabled
          ? "등록된 이메일로 로그인 링크를 보내드립니다."
          : "이메일 로그인은 현재 사용하지 않습니다. 관리자에게 문의해 주세요."}
      </p>

      {!magicLinkEnabled ? null : sent ? (
        <p className="mt-6 text-sm text-green-700">
          메일함을 확인하세요. 로그인 링크를 보냈습니다.
        </p>
      ) : (
        <form action={login} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            name="email"
            required
            placeholder="you@egnis.kr"
            className="rounded-md border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
          >
            로그인 링크 받기
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
