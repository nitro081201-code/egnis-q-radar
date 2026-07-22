import { redirect } from "next/navigation";
import { login } from "./actions";
import {
  isGoogleLoginEnabled,
  isMagicLinkEnabled,
  isVibeGateOnly,
} from "@/lib/auth-config";
import GoogleLoginButton from "./google-button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  // 게이트 전용 모드에는 로그인 개념이 없으므로 board로 돌려보낸다.
  if (isVibeGateOnly()) redirect("/board");

  const { error, sent } = await searchParams;
  const googleEnabled = isGoogleLoginEnabled();
  const magicLinkEnabled = isMagicLinkEnabled();

  const subtitle = googleEnabled
    ? "회사 Google 계정으로 로그인해 주세요."
    : magicLinkEnabled
      ? "등록된 이메일로 로그인 링크를 보내드립니다."
      : "현재 사용 가능한 로그인 수단이 없습니다. 관리자에게 문의해 주세요.";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="text-lg font-semibold">EGNIS Q-Radar 로그인</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>

      {googleEnabled && <GoogleLoginButton />}

      {/* Google과 매직링크가 동시에 켜져 있는 전환기에는 구분선을 둔다 */}
      {googleEnabled && magicLinkEnabled && (
        <p className="mt-6 text-center text-xs text-gray-400">또는 이메일로 로그인</p>
      )}

      {magicLinkEnabled &&
        (sent ? (
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
        ))}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
