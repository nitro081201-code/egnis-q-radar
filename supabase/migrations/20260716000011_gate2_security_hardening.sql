-- =========================================================
-- EGNIS Q-Radar: Gate 2 보안 하드닝
-- =========================================================
-- Gate 1(20260716000010)에서 실제 로그인 계정 테스트 이후로 미뤄둔 나머지 항목 처리.
-- db advisors(security) 재확인 결과 아래 9건이 남아 있었음:
--   - extension_in_public: pg_trgm이 public 스키마에 설치됨
--   - anon_security_definer_function_executable (4건): handle_new_auth_user,
--     is_active_admin, is_active_user, is_active_editor_or_admin
--   - authenticated_security_definer_function_executable (4건): 위와 동일 함수들

-- ---------------------------------------------------------
-- 1) pg_trgm을 public 밖 전용 스키마로 이동
-- ---------------------------------------------------------
-- Supabase 프로젝트는 기본적으로 extensions 스키마를 제공하고
-- search_path에 이미 포함되어 있으므로(-- "$user", public, extensions),
-- 이동 후에도 기존 gin_trgm_ops 인덱스·쿼리에 영향이 없다.
alter extension pg_trgm set schema extensions;

-- ---------------------------------------------------------
-- 2) handle_new_auth_user(): auth.users INSERT 트리거 전용 함수.
--    트리거 실행은 함수 EXECUTE 권한과 무관하므로 anon/authenticated의
--    직접 RPC 호출 권한만 회수해도 트리거 동작에는 영향이 없다.
-- ---------------------------------------------------------
revoke execute on function public.handle_new_auth_user() from anon, authenticated;

-- ---------------------------------------------------------
-- 3) is_active_admin / is_active_user / is_active_editor_or_admin:
--    RLS 정책 평가 시 authenticated 롤은 반드시 실행 권한이 있어야 하므로 유지한다.
--    anon 롤은 로그인 없이 콘텐츠 테이블에 접근할 수 없도록 설계되어 있으므로
--    (§ RLS 정책, is_active_user()가 항상 false) 직접 RPC 호출 권한만 회수한다.
-- ---------------------------------------------------------
revoke execute on function public.is_active_admin() from anon;
revoke execute on function public.is_active_user() from anon;
revoke execute on function public.is_active_editor_or_admin() from anon;
