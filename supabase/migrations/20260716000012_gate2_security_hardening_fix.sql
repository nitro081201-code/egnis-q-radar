-- =========================================================
-- EGNIS Q-Radar: Gate 2 보안 하드닝 보정
-- =========================================================
-- 20260716000011에서 anon/authenticated 롤의 EXECUTE 권한을 회수했으나,
-- PostgreSQL은 함수 생성 시 기본적으로 PUBLIC 의사 롤(pseudo-role)에도
-- EXECUTE를 부여한다. anon/authenticated는 PUBLIC에 암묵적으로 속하므로
-- PUBLIC 권한이 남아있으면 개별 REVOKE는 무력화된다 (db advisors 재확인 결과
-- 8건 경고가 그대로 남아있어 확인됨). PUBLIC에서도 명시적으로 회수한다.

revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.is_active_admin() from public;
revoke execute on function public.is_active_user() from public;
revoke execute on function public.is_active_editor_or_admin() from public;

-- PUBLIC 회수는 authenticated 롤의 권한도 함께 제거하므로,
-- RLS 정책 평가에 필요한 is_active_* 3종은 authenticated에 다시 명시적으로 부여한다.
-- handle_new_auth_user()는 트리거 전용이라 재부여하지 않는다.
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_active_editor_or_admin() to authenticated;
