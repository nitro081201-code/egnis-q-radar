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

-- 참고: is_active_admin() / is_active_user() / is_active_editor_or_admin()
-- 권한 헬퍼 함수는 profiles 테이블을 참조하므로, profiles 테이블 생성
-- 이후인 20260716000002_profiles.sql 파일에 정의되어 있다.
