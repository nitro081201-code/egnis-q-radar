-- =========================================================
-- EGNIS Q-Radar: 개인 이메일 관리자 계정 추가
-- =========================================================
-- 퇴사 시 사내 도메인 계정(jhcho@egnis.kr)이 만료되는 상황에 대비해,
-- 개인 이메일(nitro081201@gmail.com)도 동일한 관리자 권한을 갖도록 함.

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) in ('jhcho@egnis.kr', 'nitro081201@gmail.com') then
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

-- 이미 가입되어 있던 계정이라면 즉시 관리자 권한으로 승격
update profiles
set role = 'admin', is_active = true
where lower(email) = 'nitro081201@gmail.com';
