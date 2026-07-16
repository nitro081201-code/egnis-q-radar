-- =========================================================
-- EGNIS Q-Radar: 태그 룰 (룰 기반 자동분류 — AI 불필요)
-- =========================================================

create table tag_rules (
  id          serial primary key,
  keyword     text not null,          -- 위반내용/회수사유에서 찾을 키워드
  tag         text not null,          -- 부여할 태그
  target      text not null default 'all' check (target in ('disposition', 'recall', 'all')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 태그 문자열 정규화: 앞뒤 공백 제거 + 연속 공백 축소.
-- '#' 접두사와 한글 대소문자는 그대로 두되(한글은 대소문자 개념이 없음),
-- 사람이 실수로 넣는 이중 공백/트레일링 스페이스로 인한 중복 태그를 방지한다.
create or replace function normalize_tag(raw text)
returns text
language sql
immutable
as $$
  select trim(regexp_replace(raw, '\s+', ' ', 'g'));
$$;

-- 폴리모픽 태그 연결 (FK 없음 — item_type으로 구분)
create table item_tags (
  item_type   text not null check (item_type in ('disposition', 'recall', 'regulation')),
  item_id     uuid not null,
  tag         text not null,
  tagged_by   text not null default 'rule' check (tagged_by in ('rule', 'manual')),
  created_at  timestamptz not null default now(),
  primary key (item_type, item_id, tag)
);
create index idx_tags_tag on item_tags (tag);
create index idx_tags_item on item_tags (item_type, item_id);

-- 콘텐츠 삭제 시 orphan item_tags/board_items가 남지 않도록 정리하는 공통 함수.
-- board_items 테이블은 이후 마이그레이션에서 생성되므로, 이 함수는 board_items
-- 마이그레이션 적용 이후부터 정상 동작한다 (함수 본문은 실행 시점에 평가됨).
create or replace function cleanup_orphan_refs()
returns trigger
language plpgsql
as $$
declare
  v_item_type text;
begin
  v_item_type := case tg_table_name
    when 'dispositions' then 'disposition'
    when 'recalls' then 'recall'
    when 'regulations' then 'regulation'
  end;

  delete from item_tags where item_type = v_item_type and item_id = old.id;
  delete from board_items where item_type = v_item_type and item_id = old.id;

  return old;
end;
$$;

create trigger trg_disp_cleanup_refs
  after delete on dispositions
  for each row execute function cleanup_orphan_refs();

create trigger trg_recall_cleanup_refs
  after delete on recalls
  for each row execute function cleanup_orphan_refs();

create trigger trg_reg_cleanup_refs
  after delete on regulations
  for each row execute function cleanup_orphan_refs();

-- 초기 태그 룰 시드 (스펙 §3.4 원문 그대로)
insert into tag_rules (keyword, tag, target) values
  ('대장균',       '#미생물부적합', 'all'),
  ('세균수',       '#미생물부적합', 'all'),
  ('미생물',       '#미생물부적합', 'all'),
  ('살모넬라',     '#미생물부적합', 'all'),
  ('질병',         '#의약품오인',   'disposition'),
  ('치료',         '#의약품오인',   'disposition'),
  ('예방',         '#의약품오인',   'disposition'),
  ('의약품으로 오인', '#의약품오인', 'disposition'),
  ('표시',         '#표시광고',     'disposition'),
  ('광고',         '#표시광고',     'disposition'),
  ('허위',         '#표시광고',     'disposition'),
  ('과대',         '#표시광고',     'disposition'),
  ('이물',         '#이물',         'all'),
  ('금속',         '#이물',         'all'),
  ('벌레',         '#이물',         'all'),
  ('곰팡이',       '#이물',         'all'),
  ('자가품질',     '#자가품질검사', 'disposition'),
  ('소비기한',     '#소비기한',     'all'),
  ('유통기한',     '#소비기한',     'all'),
  ('무신고',       '#무신고',       'disposition'),
  ('무등록',       '#무신고',       'disposition'),
  ('위생',         '#위생관리',     'disposition'),
  ('기준규격',     '#기준규격',     'all'),
  ('잔류농약',     '#기준규격',     'all'),
  ('중금속',       '#기준규격',     'all');
