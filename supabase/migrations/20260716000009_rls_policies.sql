-- =========================================================
-- EGNIS Q-Radar: RLS (Row Level Security) 전체 정책
-- =========================================================
-- 원칙:
--   1) 비로그인 사용자는 어떤 데이터도 조회할 수 없다 (RLS는 기본적으로 auth.uid()가
--      null이면 아래 모든 정책의 auth.uid() 비교가 거짓이 되어 자동 차단된다).
--   2) profiles.is_active = false인 사용자는 활성 사용자 전용 정책에서 모두 차단된다.
--   3) dispositions/recalls/regulations 등 콘텐츠 테이블의 쓰기(INSERT/UPDATE/DELETE)는
--      RLS 정책을 만들지 않는다 = 기본 거부. 실제 쓰기는 서버의 service role
--      (수집 파이프라인, 관리자 API 라우트)에서만 수행한다 (service role은 RLS 우회).

-- ---------------------------------------------------------
-- dispositions
-- ---------------------------------------------------------
alter table dispositions enable row level security;

create policy "dispositions_select_admin_all" on dispositions
  for select
  using (is_active_admin());

create policy "dispositions_select_published_visible" on dispositions
  for select
  using (
    is_active_user()
    and status = 'published'
    and visibility_status = 'visible'
  );

-- ---------------------------------------------------------
-- recalls
-- ---------------------------------------------------------
alter table recalls enable row level security;

create policy "recalls_select_admin_all" on recalls
  for select
  using (is_active_admin());

create policy "recalls_select_published" on recalls
  for select
  using (is_active_user() and status = 'published');

-- ---------------------------------------------------------
-- regulations
-- ---------------------------------------------------------
alter table regulations enable row level security;

create policy "regulations_select_admin_all" on regulations
  for select
  using (is_active_admin());

create policy "regulations_select_published" on regulations
  for select
  using (is_active_user() and status = 'published');

-- ---------------------------------------------------------
-- tag_rules / item_tags
-- ---------------------------------------------------------
alter table tag_rules enable row level security;
alter table item_tags enable row level security;

create policy "tag_rules_select_active_user" on tag_rules
  for select
  using (is_active_user());

create policy "tag_rules_write_admin_only" on tag_rules
  for all
  using (is_active_admin())
  with check (is_active_admin());

create policy "item_tags_select_active_user" on item_tags
  for select
  using (is_active_user());

create policy "item_tags_insert_manual_editor" on item_tags
  for insert
  with check (is_active_editor_or_admin() and tagged_by = 'manual');

create policy "item_tags_delete_editor" on item_tags
  for delete
  using (is_active_editor_or_admin());

-- ---------------------------------------------------------
-- boards / board_items
-- ---------------------------------------------------------
alter table boards enable row level security;
alter table board_items enable row level security;

create policy "boards_select_owner_or_shared" on boards
  for select
  using (owner_id = auth.uid() or (is_shared = true and is_active_user()));

create policy "boards_insert_owner" on boards
  for insert
  with check (owner_id = auth.uid() and is_active_user());

create policy "boards_update_owner" on boards
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "boards_delete_owner" on boards
  for delete
  using (owner_id = auth.uid());

create policy "board_items_select_via_board" on board_items
  for select
  using (
    exists (
      select 1 from boards b
      where b.id = board_items.board_id
        and (b.owner_id = auth.uid() or (b.is_shared = true and is_active_user()))
    )
  );

create policy "board_items_insert_board_owner" on board_items
  for insert
  with check (
    added_by = auth.uid()
    and exists (select 1 from boards b where b.id = board_items.board_id and b.owner_id = auth.uid())
  );

create policy "board_items_delete_board_owner" on board_items
  for delete
  using (
    exists (select 1 from boards b where b.id = board_items.board_id and b.owner_id = auth.uid())
  );

-- ---------------------------------------------------------
-- actions / action_evidence
-- ---------------------------------------------------------
alter table actions enable row level security;
alter table action_evidence enable row level security;

create policy "actions_select_active_user" on actions
  for select
  using (is_active_user());

create policy "actions_insert_editor" on actions
  for insert
  with check (is_active_editor_or_admin() and created_by = auth.uid());

create policy "actions_update_editor" on actions
  for update
  using (is_active_editor_or_admin())
  with check (is_active_editor_or_admin());

create policy "actions_delete_admin" on actions
  for delete
  using (is_active_admin());

create policy "action_evidence_select_active_user" on action_evidence
  for select
  using (is_active_user());

create policy "action_evidence_insert_editor" on action_evidence
  for insert
  with check (is_active_editor_or_admin() and uploaded_by = auth.uid());

create policy "action_evidence_delete_editor" on action_evidence
  for delete
  using (is_active_editor_or_admin());

-- ---------------------------------------------------------
-- collection_runs (조회만 허용, 쓰기는 service role 전용)
-- ---------------------------------------------------------
alter table collection_runs enable row level security;

create policy "collection_runs_select_active_user" on collection_runs
  for select
  using (is_active_user());

-- ---------------------------------------------------------
-- partners (Phase 3 대비 — 조회만, 쓰기는 admin 전용)
-- ---------------------------------------------------------
alter table partners enable row level security;

create policy "partners_select_active_user" on partners
  for select
  using (is_active_user());

create policy "partners_write_admin_only" on partners
  for all
  using (is_active_admin())
  with check (is_active_admin());
