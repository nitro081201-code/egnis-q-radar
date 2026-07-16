-- =========================================================
-- EGNIS Q-Radar: dispositions (행정처분)
-- =========================================================
-- 개인정보 처리 원칙 (지시사항 §6):
--   - 대표자명, 전화번호, 상세주소, 전체 인허가번호는 저장하지 않는다.
--   - 인허가번호는 화면표시용 마스킹 값(license_no_masked)과
--     중복확인용 단방향 해시(license_no_hash)만 저장한다.
--   - API 원문은 raw_data가 아니라, 개인정보를 제거한 뒤
--     allowlist된 필드만 담는 sanitized_raw_data에 저장한다.
--
-- 공개기한 관리 원칙 (지시사항 §7):
--   - public_until이 없거나 파싱 실패 시 자동 공개하지 않고 검수대상(quarantined)으로 둔다.
--   - 공개기한이 지나면 visibility_status='expired'로 전환, 일반 사용자에게는
--     업체 식별정보가 노출되지 않는다 (관리자만 만료 여부·내부조치 존재를 확인 가능).
--
-- 상태값 두 축:
--   status            : 데이터 품질/검수 파이프라인 상태 (일반 목록 노출 여부의 1차 기준)
--   visibility_status : 공개기한에 따른 업체정보 노출 여부 (2차 기준, admin은 항상 조회 가능)

create table dispositions (
  id                          uuid primary key default gen_random_uuid(),
  source_key                  text unique not null,
  -- 중복방지 자연키. 공식 API 일련번호 우선 사용, 없으면
  -- md5(service_name || company_name || license_no_hash || disposition_date || agency || type_raw || detail_raw)

  category                    text not null check (category in
                                ('food', 'health_functional', 'imported_food', 'cosmetic')),
  business_type                text,          -- 식품제조가공업/식품판매업/식품접객업/수입식품업 등 원문 그대로
  company_name                 text not null,
  region                       text,          -- 시도 단위만 저장 (개인정보 최소화)

  license_no_masked            text,          -- 예: '2019-****' 화면 표시용
  license_no_hash              text,          -- 원본 인허가번호의 단방향 해시 (dedup 전용, 원본은 폐기)

  violation_law                text,          -- 근거 조항 원문
  violation_content             text,          -- 위반내용 원문
  violation_date                date,

  disposition_type_raw          text,          -- API/원문 그대로
  disposition_type_normalized   text check (disposition_type_normalized in
                                ('시정명령', '영업정지', '품목제조정지', '과징금',
                                 '영업소폐쇄', '등록취소', '공표', '회수폐기', '기타')),
  disposition_detail            text,          -- 처분내용 원문 (예: '영업정지 15일')
  disposition_date              date,
  disposition_agency            text,

  risk_score                   int,           -- 0~100. UI 표시는 반드시 "내부 검토 우선순위"
  risk_level                   text check (risk_level in ('critical', 'high', 'medium', 'low')),

  company_relevance            text not null default 'unknown' check (company_relevance in
                                ('related', 'review_needed', 'unrelated', 'unknown')),
  action_status                text not null default 'unreviewed' check (action_status in
                                ('unreviewed', 'open', 'in_progress', 'done', 'cancelled')),
  -- 주의: 이 컬럼은 조회 편의를 위한 캐시일 뿐, 단일 기준은 actions 테이블이다.
  -- actions 변경 시 트리거로 자동 동기화된다 (별도 마이그레이션의 sync 트리거 참고).

  source_type                  text not null check (source_type in
                                ('api_mfds', 'crawl_mfds', 'manual')),
  source_url                   text,
  sanitized_raw_data           jsonb not null default '{}',
  -- 개인정보 제거 + allowlist 필드만 담은 원문 스냅샷. API 응답 전체를 그대로 넣지 않는다.
  payload_hash                 text,          -- sanitized_raw_data 기준 변경감지 해시

  public_until                 date,          -- 공식 공개기한. null이면 자동공개 금지 (검수대상)
  source_updated_at            timestamptz,   -- 공식 데이터 최종수정일
  first_seen_at                timestamptz not null default now(),
  last_seen_at                 timestamptz not null default now(),
  visibility_status            text not null default 'quarantined' check (visibility_status in
                                ('visible', 'expired', 'quarantined', 'rejected')),

  status                       text not null default 'ingested' check (status in
                                ('ingested', 'quarantined', 'unverified', 'published', 'expired', 'rejected')),
  -- api_mfds: 파싱/개인정보제거/공개기한 확인 통과 시 published로 전환, 실패 시 quarantined 유지.
  -- manual(화장품 등)은 admin 검수 전까지 unverified.

  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

create trigger trg_dispositions_updated_at
  before update on dispositions
  for each row execute function set_updated_at();

create index idx_disp_category        on dispositions (category);
create index idx_disp_date            on dispositions (disposition_date desc);
create index idx_disp_risk            on dispositions (risk_level, disposition_date desc);
create index idx_disp_company         on dispositions using gin (company_name gin_trgm_ops);
create index idx_disp_status          on dispositions (status);
create index idx_disp_visibility      on dispositions (visibility_status);
create index idx_disp_public_until    on dispositions (public_until);
-- source_key는 unique 제약으로 이미 색인이 생성되어 별도 인덱스가 필요 없다.
