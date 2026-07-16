-- =========================================================
-- EGNIS Q-Radar: 보안 하드닝 (Supabase 자동 보안진단 결과 반영)
-- =========================================================
-- db advisors(security) 실행 결과 발견된 "search_path 미고정" 경고를 수정한다.
-- search_path를 명시하지 않으면 이론적으로 다른 스키마의 동일 이름 객체가
-- 끼어들 수 있으므로, 함수 정의에 항상 search_path를 고정한다.

alter function set_updated_at() set search_path = public;
alter function sync_content_action_status() set search_path = public;
alter function normalize_tag(text) set search_path = public;
alter function cleanup_orphan_refs() set search_path = public;

-- 참고: db advisors에서 함께 발견된 "SECURITY DEFINER 함수가 anon/authenticated
-- 롤에서 RPC로 직접 호출 가능" 경고(is_active_admin 등)는 이번 마이그레이션에서
-- 바로 잠그지 않았다. 이 함수들은 RLS 정책 평가 시 authenticated 롤이 반드시
-- 실행 권한을 가지고 있어야 하므로, 로그인 계정(Jay)으로 실제 접근 테스트를
-- 마친 뒤 anon 롤의 실행 권한만 선택적으로 회수하는 편이 안전하다 (Gate 2에서 처리).
