-- =========================================================
-- EGNIS Q-Radar: 신규 가입 자동활성화를 사내 도메인으로 제한
-- =========================================================
-- 배경: Google OAuth 로그인을 도입하면 로그인 요청이 서버 액션(login/actions.ts)을
-- 거치지 않으므로, 거기에 있던 "@egnis.kr 만 허용" 검사가 우회된다.
-- 외부 계정이 자동으로 활성 viewer가 되는 것을 막기 위해 활성화 판단을 DB로 옮긴다.
--
--   사내 도메인(@egnis.kr) → viewer / 활성  (기존 "링크만 공유하면 조회 가능" 정책 유지)
--   그 외 도메인           → viewer / 비활성 (관리자가 명시적으로 활성화해야 접근 가능)
--
-- 이미 존재하는 profiles 행은 이 트리거의 영향을 받지 않는다(신규 가입 시에만 동작).

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = 'jhcho@egnis.kr' then
    insert into profiles (id, email, role, is_active)
    values (new.id, new.email, 'admin', true)
    on conflict (id) do nothing;
  elsif lower(new.email) like '%@egnis.kr' then
    insert into profiles (id, email, role, is_active)
    values (new.id, new.email, 'viewer', true)
    on conflict (id) do nothing;
  else
    insert into profiles (id, email, role, is_active)
    values (new.id, new.email, 'viewer', false)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
