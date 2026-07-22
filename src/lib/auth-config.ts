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

/**
 * vibe 게이트 전용 모드. 기본 꺼짐.
 *
 * vibe(q-radar.egnis.net)는 회사 Google 계정 게이트 뒤에 있으므로, 그 배포본에 한해
 * 앱 자체 로그인을 없애고 게이트를 신뢰한다. 켜면 board를 로그인 없이 조회할 수 있다.
 *
 * ⚠️ 이 모드는 반드시 vibe 배포본에서만 켠다. 게이트가 없는 배포(Vercel 등)에서 켜면
 *    아무나 board를 볼 수 있게 된다. 또한 DB 쪽 익명 조회 정책
 *    (supabase/migrations/20260722000002_anon_read_public_monitoring_data.sql)이
 *    적용되어 있어야 실제로 데이터가 보인다.
 *
 * 세션이 없으므로 관리자 기능(사용자 관리·검수)은 이 모드에서 노출되지 않는다.
 * 켜려면 AUTH_VIBE_GATE_ONLY=true
 */
export function isVibeGateOnly(): boolean {
  return (process.env.AUTH_VIBE_GATE_ONLY ?? "false").toLowerCase() === "true";
}
