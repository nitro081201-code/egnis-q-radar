-- =========================================================
-- EGNIS Q-Radar: regulations (법령·고시·입법예고)
-- =========================================================
-- 지시사항 §16: 법률/시행령/시행규칙, 식약처 고시, 입법·행정예고를
-- source_name으로 명확히 구분하고, 제목만으로 중복 판단하지 않는다.
-- 공고번호·고시번호·시행일·공식 URL을 우선 사용해 source_key를 만든다.

create table regulations (
  id              uuid primary key default gen_random_uuid(),
  source_key      text unique not null,
  source_name     text not null,     -- 예: 'law_go_kr', 'mfds_notice', 'mfds_pre_announce'
  reg_type        text not null check (reg_type in
                    ('법률', '시행령', '시행규칙', '고시', '행정예고', '입법예고', '가이드라인', '공고')),
  title           text not null,
  domain          text check (domain in
                    ('food', 'health_functional', 'imported_food', 'cosmetic', 'device', 'common')),
  issuing_body    text,              -- 식약처/보건복지부 등
  notice_no       text,              -- 공고번호/고시번호 (source_key 구성에 우선 사용)
  announce_date   date,              -- 공포/공고일
  effective_date  date,              -- 시행일 (D-day 계산용, 없으면 D-day 미표시)
  summary         text,              -- 주요 변경사항 — Phase 1은 수동 입력 또는 원문 첫 단락
  impact_level    text not null default 'unknown' check (impact_level in
                    ('high', 'medium', 'low', 'none', 'unknown')),
  -- impact_level은 자동 산출하지 않는다. 사람이 검토 후 수동 지정.

  source_url      text,
  sanitized_raw_data jsonb not null default '{}',
  payload_hash     text,

  status          text not null default 'unverified' check (status in
                    ('ingested', 'quarantined', 'unverified', 'published', 'expired', 'rejected')),
  action_status    text not null default 'unreviewed' check (action_status in
                    ('unreviewed', 'open', 'in_progress', 'done', 'cancelled')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger trg_regulations_updated_at
  before update on regulations
  for each row execute function set_updated_at();

create index idx_reg_effective on regulations (effective_date);
create index idx_reg_type      on regulations (reg_type, announce_date desc);
create index idx_reg_source    on regulations (source_name);
create index idx_reg_status    on regulations (status);
