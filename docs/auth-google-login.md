# Google 로그인 전환 가이드

이메일 매직링크를 없애고 **회사 Google 계정 로그인**으로 바꾸기 위한 설정 절차.

## 왜 바꾸나

- Supabase 기본 SMTP는 프로젝트당 **시간당 2~4통** 제한 → 팀 공유 시 `email rate limit exceeded` 발생.
- 이 앱은 vibe(`q-radar.egnis.net`) 뒤에 있어 **이미 회사 Google 계정으로 인증**을 거친 뒤
  앱에서 **또** 이메일 로그인을 하는 이중 구조였다.
- Google 로그인으로 바꾸면 이메일 발송이 아예 없어져 한도 문제가 영구 해소되고,
  클릭 한 번으로 로그인된다. RLS 등 보안 구조는 그대로 유지된다.

## 코드는 이미 준비되어 있다

`AUTH_GOOGLE_ENABLED=true` 로 켜기만 하면 로그인 화면에 버튼이 나타난다.
기본값은 꺼짐 — Supabase에서 provider를 실제로 켜기 전에 버튼만 노출하면
클릭 시 `provider is not enabled` 오류가 나기 때문이다.

관련 파일: `src/lib/auth-config.ts`, `src/app/login/google-button.tsx`,
`src/app/login/page.tsx`, `src/app/auth/confirm/page.tsx`

## 설정 순서

### 1. Google Cloud OAuth 클라이언트 발급 (사내 IT팀)
Google Cloud Console → APIs & Services → Credentials → **Create OAuth client ID**
- Application type: **Web application**
- **Authorized redirect URI** 에 아래를 등록 (Supabase 콜백 주소):
  ```
  https://zhtxxhiyihmhfjdnttey.supabase.co/auth/v1/callback
  ```
- 발급되는 **Client ID / Client Secret** 을 받는다.

### 2. Supabase에 Google provider 등록
Supabase Dashboard → Authentication → **Providers → Google**
- Enable 켜기
- 1단계의 Client ID / Client Secret 입력 → Save

### 3. Redirect URL 확인
Authentication → URL Configuration → **Redirect URLs** 에 아래가 있어야 한다
(매직링크용으로 이미 등록되어 있음):
```
https://q-radar.egnis.net/auth/confirm
https://egnis-q-radar.vercel.app/**
```

### 4. DB 마이그레이션 적용 (보안상 필수)
`supabase/migrations/20260722000001_restrict_active_to_company_domain.sql`

Google 로그인은 서버 액션(`login/actions.ts`)을 거치지 않으므로 거기에 있던
"@egnis.kr 만 허용" 검사가 **우회된다**. 이 마이그레이션이 활성화 판단을 DB로 옮겨
사내 도메인만 자동 활성 viewer가 되게 한다. **적용하지 않고 Google 로그인을 켜면
외부 Google 계정도 조회 권한을 얻는다** (특히 외부에 열려 있는 Vercel 배포본).

### 5. 앱에서 켜기
- 로컬/Vercel: 환경변수 `AUTH_GOOGLE_ENABLED=true`
- **vibe 배포본**: 환경변수 주입 수단이 없으므로 `next.config.ts` 의 `env` 블록에
  `AUTH_GOOGLE_ENABLED: "true"` 를 추가하고 재배포.

### 6. 실제로 로그인되는지 확인한 뒤 매직링크 끄기
Google 로그인이 동작하는 것을 확인한 **다음에** `AUTH_MAGIC_LINK_ENABLED=false` 로 끈다.
(순서를 바꾸면 아무도 로그인할 수 없다 — docs/auth-magic-link.md 참고)

## 전환기 동작

두 스위치를 모두 켜두면 로그인 화면에 Google 버튼과 이메일 폼이 함께 나온다.
안전하게 갈아탈 때 이 상태를 거치면 된다.

## 외부 계정을 예외적으로 허용해야 할 때

사내 도메인이 아닌 계정은 로그인은 되지만 `is_active=false` 라 데이터에 접근할 수 없다.
필요하면 관리자가 `/admin/users` 에서 활성화하거나, DB에서 직접:
```sql
update profiles set is_active = true where lower(email) = '<대상 이메일>';
```
