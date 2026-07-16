-- =========================================================
-- EGNIS Q-Radar: 수집 이력 + 협력사 마스터(Phase 3 대비, 스키마만 선점)
-- =========================================================

create table collection_runs (
  id                  uuid primary key default gen_random_uuid(),
  source_name         text not null,     -- 'disposition_food_mnft' 등 §2 소스별 식별자
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  status              text check (status in ('success', 'partial', 'failed')),
  records_fetched     int not null default 0,
  records_inserted    int not null default 0,
  records_updated     int not null default 0,
  records_skipped     int not null default 0,
  records_quarantined int not null default 0,
  error_summary       text,
  triggered_by        text not null default 'cron' check (triggered_by in ('cron', 'manual'))
);
create index idx_runs_source on collection_runs (source_name, started_at desc);

-- ---------------------------------------------------------
-- 협력사 마스터 (Phase 3 대비 — 테이블만 선점, MVP에서 UI 미구현)
-- ---------------------------------------------------------
create table partners (
  id              uuid primary key default gen_random_uuid(),
  partner_name    text not null,
  partner_type    text check (partner_type in ('oem', 'odm', 'raw_material', 'logistics', 'other')),
  brand_scope     text,              -- 관련 자사 브랜드
  license_no_hash text,              -- 매칭 키 (인허가번호의 단방향 해시 — 원본 보관 금지)
  aliases         text[],            -- 상호 변경 이력·법인명 표기 변형 대응
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
-- Phase 3 매칭 로직: dispositions.company_name / recalls.company_name을
-- partners.partner_name + aliases와 trigram 유사도 매칭 → company_relevance 자동 갱신
