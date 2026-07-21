-- =========================================================
-- EGNIS Q-Radar: 관리자 부트스트랩 표준화 (개인 계정 하드코딩 제거)
-- =========================================================
-- 신규 가입 트리거에서 개인 이메일을 admin으로 자동 지정하던 로직을 제거한다.
-- 코드로 두는 부트스트랩 관리자는 회사 계정 하나뿐이며, 그 외 관리자 지정은
-- 앱/DB에서 profiles.role 을 수동으로 관리한다.

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
  else
    insert into profiles (id, email, role, is_active)
    values (new.id, new.email, 'viewer', true)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- 참고: 라이브 DB에 이미 부여된 관리자 권한은 이 마이그레이션으로 바뀌지 않는다.
-- 특정 계정의 관리자 권한을 회수하려면 아래를 수동 실행할 것(원하는 경우에만):
--   update profiles set role = 'viewer' where lower(email) = '<대상 이메일>';
