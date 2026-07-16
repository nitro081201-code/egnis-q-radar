-- =========================================================
-- EGNIS Q-Radar: 보드(개인/공용) + 조치관리 + 증빙파일
-- =========================================================

create table boards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid not null references auth.users(id),
  is_shared   boolean not null default false,   -- true면 승인된 팀 전체 조회 가능 (RLS)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table board_items (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards(id) on delete cascade,
  item_type   text not null check (item_type in ('disposition', 'recall', 'regulation')),
  item_id     uuid not null,
  memo        text,
  added_by    uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (board_id, item_type, item_id)
);
create index idx_board_items_board on board_items (board_id);
create index idx_board_items_item  on board_items (item_type, item_id);

-- ---------------------------------------------------------
-- 조치관리 (저장과 조치를 분리 — Q-Radar 차별점)
-- ---------------------------------------------------------
create table actions (
  id              uuid primary key default gen_random_uuid(),
  item_type       text not null check (item_type in ('disposition', 'recall', 'regulation')),
  item_id         uuid not null,
  related_brand   text,              -- 예: 랩노쉬
  related_products text,             -- 콤마 구분 자유입력 (Phase 3에서 partners와 연결)
  assignee        text not null,     -- 담당자명
  due_date        date,
  status          text not null default 'open' check (status in
                    ('open', 'in_progress', 'done', 'cancelled')),
  review_opinion  text,              -- 검토의견
  action_detail   text,              -- 조치내역
  approved_by     text,              -- 최종 승인자
  approved_at     timestamptz,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_actions_status on actions (status, due_date);
create index idx_actions_item   on actions (item_type, item_id);

create trigger trg_actions_updated_at
  before update on actions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------
-- 증빙파일 (action_evidence — 단일 evidence_url 대신 다건 관리)
-- ---------------------------------------------------------
create table action_evidence (
  id                  uuid primary key default gen_random_uuid(),
  action_id           uuid not null references actions(id) on delete cascade,
  storage_path        text not null,     -- Supabase Storage private bucket 내 경로
  original_file_name  text not null,
  mime_type            text not null,
  file_size            bigint not null,
  uploaded_by          uuid not null references auth.users(id),
  uploaded_at           timestamptz not null default now()
);
create index idx_action_evidence_action on action_evidence (action_id);

-- ---------------------------------------------------------
-- 콘텐츠 테이블의 action_status를 actions 기준으로 자동 동기화
-- (지시사항 §13: 단일 기준은 actions 테이블. 사용자가 두 곳을 따로 수정하지 않도록)
-- ---------------------------------------------------------
create or replace function sync_content_action_status()
returns trigger
language plpgsql
as $$
declare
  v_item_type text;
  v_item_id uuid;
  v_computed text;
  v_has_open boolean;
  v_has_in_progress boolean;
  v_has_done boolean;
  v_has_cancelled boolean;
  v_has_any boolean;
begin
  v_item_type := coalesce(new.item_type, old.item_type);
  v_item_id   := coalesce(new.item_id, old.item_id);

  select
    count(*) > 0,
    bool_or(status = 'open'),
    bool_or(status = 'in_progress'),
    bool_or(status = 'done'),
    bool_or(status = 'cancelled')
  into v_has_any, v_has_open, v_has_in_progress, v_has_done, v_has_cancelled
  from actions
  where item_type = v_item_type and item_id = v_item_id;

  if not v_has_any then
    v_computed := 'unreviewed';
  elsif v_has_open then
    v_computed := 'open';
  elsif v_has_in_progress then
    v_computed := 'in_progress';
  elsif v_has_done and not v_has_cancelled then
    v_computed := 'done';
  elsif v_has_done and v_has_cancelled then
    v_computed := 'done';
  else
    -- 취소된 액션만 존재하는 경우
    v_computed := 'cancelled';
  end if;

  if v_item_type = 'disposition' then
    update dispositions set action_status = v_computed where id = v_item_id;
  elsif v_item_type = 'recall' then
    update recalls set action_status = v_computed where id = v_item_id;
  elsif v_item_type = 'regulation' then
    update regulations set action_status = v_computed where id = v_item_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_actions_sync_status
  after insert or update or delete on actions
  for each row execute function sync_content_action_status();
