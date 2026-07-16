-- =========================================================
-- EGNIS Q-Radar: 신규 가입자 자동 활성화(조회자)로 정책 변경
-- =========================================================
-- 애초 "관리자가 수동 활성화" 원칙(20260716000002)에서, 유관부서 인원에게
-- 링크만 공유해 자유롭게 조회할 수 있게 하는 쪽으로 방향을 바꿈. 이메일
-- 허용목록(ALLOWED_EMAILS) 제한도 앱 코드에서 함께 제거한다.
-- 부트스트랩 관리자(jhcho@egnis.kr)는 기존과 동일하게 admin/활성 유지.

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
