# 이메일 매직링크 로그인 — 끄기 / 되살리기

## 현재 상태

**켜짐(기본값).** 이 앱의 유일한 로그인 수단이다.

## 왜 끄고 싶었나 (배경 기록)

Supabase **기본 SMTP는 프로젝트당 시간당 2~4통**만 허용한다. 혼자 쓸 때는 문제가 없었으나
팀에 공유하자마자 `email rate limit exceeded` 가 발생해 여러 명이 동시에 로그인할 수 없었다.
로그아웃 후 즉시 재로그인해도 같은 오류가 난다.

또한 이 앱은 vibe(`q-radar.egnis.net`) 뒤에 있어서 **이미 회사 Google 계정으로 한 번 인증**을
거친 뒤 앱에서 **또** 이메일 로그인을 하는 이중 구조였다.

## 끄는 법

환경변수 하나만 설정한다. **코드를 지우지 말 것.**

```
AUTH_MAGIC_LINK_ENABLED=false
```

- 로컬/Vercel: `.env.local` 또는 Vercel 환경변수에 추가.
- **vibe 배포본**: vibe에는 환경변수 주입 수단이 없으므로 `next.config.ts` 의 `env` 블록에
  `AUTH_MAGIC_LINK_ENABLED: "false"` 를 추가하고 다시 배포한다.

끄면 로그인 화면에서 이메일 입력 폼이 사라지고, 서버 액션도 직접 호출을 거부한다.

## 되살리는 법

`AUTH_MAGIC_LINK_ENABLED` 값을 지우거나 `true` 로 바꾸고 재배포하면 끝. 원래 코드는
그대로 남아 있으므로 별도 복구 작업이 필요 없다.

## ⚠️ 끄기 전 반드시 확인

**매직링크가 유일한 로그인 수단이다.** 대체 수단이 실제로 동작하기 전에 끄면
관리자 포함 아무도 로그인할 수 없다. 아래 중 하나가 먼저 준비돼야 한다.

### 대체안 A — Google 로그인 (권장)
- Supabase Dashboard → Authentication → Providers → **Google 활성화**
  (Google Cloud OAuth 클라이언트 ID/시크릿 필요 — 사내 IT팀에서 발급 가능)
- 코드: 로그인 페이지에 Google 버튼 추가
  `supabase.auth.signInWithOAuth({ provider: "google", options: { queryParams: { hd: "egnis.kr" } } })`
- 이메일 발송이 아예 없어져 rate limit이 영구 해소되고, RLS/보안 구조는 그대로 유지된다.

### 대체안 B — 커스텀 SMTP (매직링크 유지, 한도만 해제)
- Supabase Dashboard → Project Settings → Authentication → **SMTP Settings**
  (Google Workspace SMTP relay, Resend, SendGrid 등)
- 이후 Authentication → Rate Limits 에서 이메일 발송 한도 상향.
- 이 경우 매직링크를 끌 필요 자체가 없어진다.

### 대체안 C — vibe 게이트 신원 재사용 (비권장)
vibe가 서버형 앱에 주입하는 `X-Egnis-User-Email` 헤더(위조 불가)를 신뢰해 앱 로그인을 없애는 방식.
가장 매끄럽지만, 현재 RLS가 `auth.uid()` 기반이라 Supabase 세션 없이는 권한 검사가 깨진다.
우회하려면 `service_role` 을 사용자 요청 경로에서 써야 하는데 이는 `src/lib/supabase/admin.ts`
주석에서 명시적으로 금지한 패턴이며, vibe에서만 동작한다는 제약도 생긴다.

## 관련 파일

- `src/lib/auth-config.ts` — 스위치 정의
- `src/app/login/page.tsx` — 폼 렌더 분기
- `src/app/login/actions.ts` — 서버 액션 가드
