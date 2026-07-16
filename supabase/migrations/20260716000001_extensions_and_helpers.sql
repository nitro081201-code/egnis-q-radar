-- =========================================================
-- EGNIS Q-Radar: 확장 기능 및 공통 헬퍼 함수
-- =========================================================

-- 회사명/제품명 부분 검색(trigram) 성능을 위해 필요
create extension if not exists pg_trgm;

-- 모든 테이블에서 공통으로 쓰는 updated_at 자동 갱신 트리거
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- RLS 정책에서 반복 사용할 "현재 로그인 사용자가 활성 admin인가" 헬퍼
-- security definer로 만들어 profiles 테이블의 RLS와 순환 참조되지 않게 한다.
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
