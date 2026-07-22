-- =========================================================
-- EGNIS Q-Radar: 공개 모니터링 데이터에 한해 익명 조회 허용
-- =========================================================
-- 배경: vibe(q-radar.egnis.net)는 회사 Google 계정 게이트 뒤에 있어 사내 인원만 접근한다.
-- 앱에서 다시 로그인(매직링크)을 받는 이중 구조를 없애기 위해, 게이트를 신뢰하고
-- 앱 로그인 없이 board를 볼 수 있게 한다.
--
-- ⚠️ 이 정책의 실제 노출 범위:
--   Supabase는 vibe 게이트 밖에 있는 별도의 공개 엔드포인트이고, anon 키는 설계상
--   브라우저에 노출되는 공개값이다. 따라서 anon에게 여는 데이터는
--   "인터넷 누구나 읽을 수 있는 데이터"가 된다.
--   그래서 식약처가 이미 공개한 행정처분·회수 정보와 수집 상태 로그만 연다.
--
-- 계속 잠겨 있는 것(=로그인 세션 필요):
--   profiles(직원 이메일), partners(협력사), boards/board_items,
--   actions/action_evidence(내부 조치기록), regulations, tag_rules/item_tags
--
-- 구현 주의(중요):
--   is_active_user()/is_active_admin() 은 하드닝(20260716000011·12)으로 authenticated
--   에게만 EXECUTE 가 부여돼 있다. 기존 SELECT 정책들은 role 지정 없이(=PUBLIC) 만들어져
--   익명 요청에도 평가되면서 "permission denied for function is_active_user" 로 실패한다.
--   따라서 함수 권한을 익명에 열어주는 대신(하드닝을 되돌리지 않는다),
--   기존 정책을 authenticated 전용으로 좁히고 익명용 정책은 컬럼 조건만으로 만든다.

-- ---------------------------------------------------------
-- 1) 기존 정책을 로그인 사용자 전용으로 좁힌다 (동작은 그대로, 평가 대상 role만 한정)
-- ---------------------------------------------------------
alter policy "dispositions_select_admin_all" on dispositions to authenticated;
alter policy "dispositions_select_published_visible" on dispositions to authenticated;

alter policy "recalls_select_admin_all" on recalls to authenticated;
alter policy "recalls_select_published" on recalls to authenticated;

alter policy "collection_runs_select_active_user" on collection_runs to authenticated;

-- ---------------------------------------------------------
-- 2) 익명(anon) 전용 조회 정책 — 헬퍼 함수를 쓰지 않는다
-- ---------------------------------------------------------

-- 행정처분 — 공개·노출 상태인 건만
create policy "dispositions_select_anon_published_visible" on dispositions
  for select
  to anon
  using (status = 'published' and visibility_status = 'visible');

-- 회수·판매중지 — 공개 상태인 건만
create policy "recalls_select_anon_published" on recalls
  for select
  to anon
  using (status = 'published');

-- 수집 실행 이력 — board 상단의 "최근 동기화 / 수집 실패" 배너용.
-- 소스명·상태·시각뿐이라 민감정보가 없다.
create policy "collection_runs_select_anon" on collection_runs
  for select
  to anon
  using (true);

-- ---------------------------------------------------------
-- 되돌리기 (앱 로그인 방식으로 복귀할 때 실행)
-- ---------------------------------------------------------
-- drop policy "dispositions_select_anon_published_visible" on dispositions;
-- drop policy "recalls_select_anon_published" on recalls;
-- drop policy "collection_runs_select_anon" on collection_runs;
-- alter policy "dispositions_select_admin_all" on dispositions to public;
-- alter policy "dispositions_select_published_visible" on dispositions to public;
-- alter policy "recalls_select_admin_all" on recalls to public;
-- alter policy "recalls_select_published" on recalls to public;
-- alter policy "collection_runs_select_active_user" on collection_runs to public;
