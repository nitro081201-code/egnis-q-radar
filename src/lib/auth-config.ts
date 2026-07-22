/**
 * 인증 수단 on/off 스위치.
 *
 * 로그인 방식을 바꿀 때 코드를 지우지 말고 환경변수로 켜고 끈다.
 * 자세한 배경·전환 순서: docs/auth-magic-link.md, docs/auth-google-login.md
 *
 * ⚠️ 둘 다 꺼지면 아무도 로그인할 수 없다. 하나는 반드시 켜져 있어야 한다.
 */

/** 이메일 매직링크 로그인. 기본 켜짐. 끄려면 AUTH_MAGIC_LINK_ENABLED=false */
export function isMagicLinkEnabled(): boolean {
  return (process.env.AUTH_MAGIC_LINK_ENABLED ?? "true").toLowerCase() !== "false";
}

/**
 * Google 로그인. 기본 꺼짐 — Supabase에서 Google provider를 실제로 활성화한 뒤에만 켠다.
 * (provider가 꺼진 채로 버튼만 노출하면 클릭 시 "provider is not enabled" 오류가 난다)
 * 켜려면 AUTH_GOOGLE_ENABLED=true
 */
export function isGoogleLoginEnabled(): boolean {
  return (process.env.AUTH_GOOGLE_ENABLED ?? "false").toLowerCase() === "true";
}
