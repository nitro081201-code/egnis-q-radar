-- =========================================================
-- EGNIS Q-Radar: profiles (사용자·권한)
-- =========================================================
-- 공개 회원가입은 허용하지 않는다. auth.users에 계정이 생성되는 경로는
-- Supabase Auth 관리자 초대(service role)뿐이다. 신규 계정이 생성되면
-- 트리거가 profiles 행을 자동 생성하되, is_active는 기본 false로 두어
-- admin이 수동으로 활성화하기 전까지는 어떤 데이터도 볼 수 없게 한다.

create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  role          text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  is_active     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- auth.users에 새 계정이 생기면 profiles 행을 자동 생성.
-- 초기 부트스트랩 관리자(jhcho@egnis.kr)는 최초 로그인 시 자동으로
-- admin / 활성 상태로 생성된다. 그 외 신규 계정은 기본 viewer / 비활성이며
-- 반드시 admin이 profiles.is_active를 수동으로 켜줘야 데이터에 접근할 수 있다.
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
    values (new.id, new.email, 'viewer', false)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------
-- RLS 정책에서 반복 사용할 권한 헬퍼 함수
-- security definer로 만들어 profiles 테이블의 RLS와 순환 참조되지 않게 한다.
-- ---------------------------------------------------------
create or replace function is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

-- "현재 로그인 사용자가 활성 사용자(admin/editor/viewer 무관)인가" 헬퍼
create or replace function is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

-- "현재 로그인 사용자가 활성 admin 또는 editor인가" 헬퍼 (데이터 등록/조치 권한)
create or replace function is_active_editor_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role in ('admin', 'editor')
      and is_active = true
  );
$$;

alter table profiles enable row level security;

-- 본인 프로필은 조회 가능, admin은 전체 조회 가능
create policy "profiles_select_self_or_admin" on profiles
  for select
  using (id = auth.uid() or is_active_admin());

-- 프로필 수정(활성화·역할변경)은 admin만 가능. 본인도 role/is_active를
-- 스스로 바꿀 수 없도록 UPDATE는 admin 전용으로만 연다.
create policy "profiles_update_admin_only" on profiles
  for update
  using (is_active_admin())
  with check (is_active_admin());

-- profiles 행 생성은 트리거(security definer)로만 이뤄지므로
-- 일반 사용자의 직접 INSERT/DELETE 정책은 만들지 않는다 (기본 거부).
