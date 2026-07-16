-- =========================================================
-- EGNIS Q-Radar: recalls (회수·판매중지)
-- =========================================================

create table recalls (
  id                    uuid primary key default gen_random_uuid(),
  source_key            text unique not null,          -- API의 회수판매중지 일련번호 사용
  category              text not null check (category in
                          ('food', 'health_functional', 'imported_food', 'cosmetic')),
  product_name          text not null,
  company_name          text not null,
  region                text,

  recall_grade_raw       text,          -- API 원문
  recall_grade_normalized text check (recall_grade_normalized in
                          ('1등급', '2등급', '3등급', '미분류')),
  recall_reason          text,          -- 회수사유 원문
  recall_method           text,
  item_report_no          text,          -- 품목제조보고번호 (자사 매칭 Phase 3 대비)
  barcode                 text,
  expiry_date             date,          -- 소비기한/유통기한
  manufacture_date        date,
  product_image_url       text,          -- API 제공 제품사진 URL
  registered_date          date,

  risk_score             int,
  risk_level              text check (risk_level in ('critical', 'high', 'medium', 'low')),
  company_relevance       text not null default 'unknown' check (company_relevance in
                          ('related', 'review_needed', 'unrelated', 'unknown')),
  action_status            text not null default 'unreviewed' check (action_status in
                          ('unreviewed', 'open', 'in_progress', 'done', 'cancelled')),
  -- 단일 기준은 actions 테이블. 이 컬럼은 트리거로 자동 동기화되는 캐시.

  source_type              text not null check (source_type in ('api_mfds', 'manual')),
  source_url               text,
  sanitized_raw_data        jsonb not null default '{}',
  payload_hash              text,

  status                   text not null default 'ingested' check (status in
                          ('ingested', 'quarantined', 'unverified', 'published', 'expired', 'rejected')),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger trg_recalls_updated_at
  before update on recalls
  for each row execute function set_updated_at();

create index idx_recall_grade    on recalls (recall_grade_normalized, registered_date desc);
create index idx_recall_company  on recalls using gin (company_name gin_trgm_ops);
create index idx_recall_product  on recalls using gin (product_name gin_trgm_ops);
create index idx_recall_status   on recalls (status);
