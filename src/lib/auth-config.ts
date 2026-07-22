/**
 * 인증 수단 on/off 스위치.
 *
 * 매직링크(이메일 로그인)를 끄고 싶을 때는 코드를 지우지 말고
 * 환경변수 AUTH_MAGIC_LINK_ENABLED=false 로 설정한다.
 * 되살리려면 값을 지우거나 true 로 두면 된다. (자세한 배경: docs/auth-magic-link.md)
 *
 * ⚠️ 현재 매직링크가 유일한 로그인 수단이므로, 대체 수단(Google 로그인 등)이
 *    동작하기 전에 끄면 아무도 로그인할 수 없다.
 */
export function isMagicLinkEnabled(): boolean {
  return (process.env.AUTH_MAGIC_LINK_ENABLED ?? "true").toLowerCase() !== "false";
}
