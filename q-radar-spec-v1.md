# EGNIS Q-Radar — 스키마 및 구현 스펙 v1.0

> 이 문서는 Claude Code(Sonnet)에 그대로 전달하여 개발을 시작하기 위한 스펙입니다.
> 작성 기준일: 2026-07-15 / 작성 주체: 품질총괄 Jay

---

## 0. 프로젝트 개요

식품·화장품 법령 및 행정처분 모니터링 보드. 광고소재 레퍼런스보드(Winning Radar)의
"수집 → 필터 → 카드 조회 → 보드 저장" UX를 품질·규제 도메인으로 전환하되,
**"저장 이후의 조치관리(담당자·기한·증빙)"까지 관리**하는 것이 차별점.

### MVP 범위 (Phase 1 — 이것만 구현)
1. 식품 행정처분 자동 수집 (식약처 공공 API, 업종 4종)
2. 식품 회수·판매중지 자동 수집 (식약처 공공 API)
3. 법령·고시 목록 수집 (국가법령정보센터 API — 착수 시 스펙 검증 필요, 아래 §4 참조)
4. 검색·필터·카드형 목록·상세보기
5. 룰 기반 자동 태그 (`tag_rules` 테이블 기반)
6. 룰 기반 위험도 점수 (§5 공식)
7. 개인/공용 보드 저장 + 조치관리(담당자·기한·상태·증빙)
8. 엑셀(CSV) 다운로드

### MVP에서 명시적으로 제외 (구현하지 말 것)
- 화장품 행정처분 자동 수집 (정형 API 없음 — 수동 입력 폼만 제공)
- AI 자동 요약, AI 신구조문 비교 (템플릿 문장 생성으로 대체, §6)
- 자사 제품/협력사 자동 매칭 (마스터 DB 부재 — 스키마만 선점, §3.8)
- 위험도 ML 모델 (룰 기반으로 충분)

### 기술 스택
- **Next.js 14+ (App Router) + Supabase (PostgreSQL) + Vercel** — 사용자의 기존 검증 스택(RA 스크리닝 앱 v0.2와 동일). 무료 티어로 시작.
- 수집: Next.js API Route + Vercel Cron (또는 Supabase Edge Function + pg_cron). PC 상시가동 불필요.
- 인증: Supabase Auth (이메일). 초기 사용자 1명(Jay), 이후 팀 확장 대비 RLS 적용.

---

## 1. 필수 고지·제약 (UI에 반영할 것)

- 공공데이터포털 API는 "실시간"이지만 **인허가 진행 중·폐기·취소·취하 건은 누락될 수 있음**.
  → 모든 목록 화면 하단에 고정 고지문: "본 데이터는 식약처 공공데이터 기준이며, 취소·취하된 처분 등 일부 건이 누락될 수 있습니다. 법적 판단 시 반드시 공식 원문을 확인하십시오."
- 개인정보 최소 수집: 대표자명 저장 금지, 인허가번호는 뒷 4자리 마스킹, 주소는 시도 단위까지만 저장.
- 마지막 수집 성공 시각을 헤더에 상시 노출 (예: "최근 동기화: 2026-07-15 07:00 · 정상").

---

## 2. 데이터 소스

| # | 데이터 | 소스 | 수집 방식 | 상태 |
|---|---|---|---|---|
| 1 | 행정처분(식품제조가공업) | data.go.kr `AdmmRsltFoodMnftPrcsService/getAdmmRsltFoodMnftPrcsBssh` | API polling 일 1회 | 검증됨 |
| 2 | 행정처분(식품판매업) | data.go.kr `AdmmRsltFoodSaleService/getAdmmRsltFoodSaleBssh` | API polling 일 1회 | 검증됨 |
| 3 | 행정처분(식품접객업) | data.go.kr 15058429 | API polling 일 1회 | 존재 확인, 엔드포인트명 Swagger에서 확인할 것 |
| 4 | 행정처분(수입식품업) | data.go.kr 검색 "행정처분결과 수입식품업" | API polling 일 1회 | 존재 확인, 엔드포인트명 확인할 것 |
| 5 | 식품 회수·판매중지 | data.go.kr/data/15074318 | API polling 일 1회 | 검증됨 |
| 6 | 수입식품 회수·판매중지 | data.go.kr/data/15095378 (`IprtFoodReclSaleStopPrdtStusService`) | API polling 일 1회 | 검증됨 |
| 7 | 법령·고시·행정예고 | 국가법령정보센터 Open API (open.law.go.kr) | API polling 일 1회 | **미검증 — 착수 시 최우선 확인** |
| 8 | 화장품 행정처분 | 식약처 홈페이지 게시판 (mfds.go.kr) | Phase 2: 크롤링+수동검수. Phase 1: 수동 입력 폼만 | 자동화 불가 확인됨 |

**소넷 지시사항**: 착수 시 #3, #4, #7의 실제 엔드포인트/파라미터를 공공데이터포털 Swagger 명세에서 먼저 확인하고, 응답 샘플 1건을 `raw_data`에 그대로 저장하는 파서를 짤 것. 인증키는 환경변수 `DATA_GO_KR_API_KEY`로 관리 (개발계정 트래픽 일 10,000건 — 일 1회 수집이면 충분).

---

## 3. 데이터베이스 스키마 (Supabase / PostgreSQL)

```sql
-- =========================================================
-- EGNIS Q-Radar Schema v1.0 (PostgreSQL 15+ / Supabase)
-- =========================================================

-- ---------------------------------------------------------
-- 3.1 행정처분 (dispositions)
-- ---------------------------------------------------------
create table dispositions (
  id                    uuid primary key default gen_random_uuid(),
  source_key            text unique not null,
  -- 중복방지 자연키. API가 일련번호를 주면 '{service}:{seq}',
  -- 없으면 md5(업체명||처분일||처분내용) 해시로 생성.

  category              text not null check (category in
                          ('food','health_functional','imported_food','cosmetic')),
  business_type         text,          -- 식품제조가공업/식품판매업/식품접객업/수입식품업 등 원문 그대로
  company_name          text not null,
  region                text,          -- 시도 단위만 (예: '경기', '서울') — 개인정보 최소화
  license_no_masked     text,          -- 예: '2019-****' 형태로 마스킹 후 저장

  violation_law         text,          -- 근거 조항 원문 (예: 식품표시광고법 제8조)
  violation_content     text,          -- 위반내용 원문
  violation_date        date,

  disposition_type      text check (disposition_type in
                          ('시정명령','영업정지','품목제조정지','과징금',
                           '영업소폐쇄','등록취소','공표','회수폐기','기타')),
  disposition_detail    text,          -- 원문 (예: '영업정지 15일')
  disposition_date      date,
  disposition_agency    text,          -- 처분기관

  risk_score            int,           -- 0~100, §5 공식으로 수집 시 산출
  risk_level            text check (risk_level in ('critical','high','medium','low')),

  company_relevance     text not null default 'unknown' check (company_relevance in
                          ('related','review_needed','unrelated','unknown')),
  action_status         text not null default 'unreviewed' check (action_status in
                          ('unreviewed','reviewing','acting','done')),

  source_type           text not null check (source_type in
                          ('api_mfds','crawl_mfds','manual')),
  source_url            text,
  raw_data              jsonb not null default '{}',   -- API/크롤링 원본 무손실 보관
  verification_status   text not null default 'unverified' check (verification_status in
                          ('unverified','reviewed','published')),
  -- 규칙: source_type='api_mfds' → 수집 즉시 'published'
  --       source_type in ('crawl_mfds','manual') → 'unverified'로 시작,
  --       사람이 검수해야 'published' (미검수 화장품 데이터의 보드 노출을 DB에서 차단)

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_disp_category   on dispositions (category);
create index idx_disp_date       on dispositions (disposition_date desc);
create index idx_disp_risk       on dispositions (risk_level, disposition_date desc);
create index idx_disp_company    on dispositions using gin (company_name gin_trgm_ops);
-- 참고: gin_trgm_ops 사용 전 `create extension if not exists pg_trgm;` 실행

-- ---------------------------------------------------------
-- 3.2 회수·판매중지 (recalls)
-- ---------------------------------------------------------
create table recalls (
  id                    uuid primary key default gen_random_uuid(),
  source_key            text unique not null,          -- API의 회수판매중지 일련번호 사용
  category              text not null check (category in
                          ('food','health_functional','imported_food','cosmetic')),
  product_name          text not null,
  company_name          text not null,
  region                text,
  recall_grade          text check (recall_grade in ('1등급','2등급','3등급','미분류')),
  recall_reason         text,          -- 회수사유 원문
  recall_method         text,
  item_report_no        text,          -- 품목제조보고번호 (자사 매칭 Phase 3 대비)
  barcode               text,
  expiry_date           date,          -- 소비기한/유통기한
  manufacture_date      date,
  product_image_url     text,          -- API 제공 제품사진 URL
  registered_date       date,

  risk_score            int,
  risk_level            text check (risk_level in ('critical','high','medium','low')),
  company_relevance     text not null default 'unknown' check (company_relevance in
                          ('related','review_needed','unrelated','unknown')),
  action_status         text not null default 'unreviewed' check (action_status in
                          ('unreviewed','reviewing','acting','done')),

  source_type           text not null check (source_type in ('api_mfds','manual')),
  source_url            text,
  raw_data              jsonb not null default '{}',
  verification_status   text not null default 'unverified',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_recall_grade    on recalls (recall_grade, registered_date desc);
create index idx_recall_company  on recalls using gin (company_name gin_trgm_ops);
create index idx_recall_product  on recalls using gin (product_name gin_trgm_ops);

-- ---------------------------------------------------------
-- 3.3 법령·고시 (regulations)
-- ---------------------------------------------------------
create table regulations (
  id                    uuid primary key default gen_random_uuid(),
  source_key            text unique not null,
  reg_type              text not null check (reg_type in
                          ('법률','시행령','시행규칙','고시','행정예고','입법예고','가이드라인','공고')),
  title                 text not null,
  domain                text check (domain in
                          ('food','health_functional','imported_food','cosmetic','device','common')),
  issuing_body          text,          -- 식약처/보건복지부 등
  announce_date         date,          -- 공포/공고일
  effective_date        date,          -- 시행일 (D-day 계산용)
  summary               text,          -- 주요 변경사항 — Phase 1은 수동 입력 또는 원문 첫 단락
  impact_level          text default 'unknown' check (impact_level in
                          ('high','medium','low','none','unknown')),
  -- impact_level은 자동 산출하지 않음. 사람이 검토 후 수동 지정 (MVP 원칙)

  source_url            text,
  raw_data              jsonb not null default '{}',
  action_status         text not null default 'unreviewed' check (action_status in
                          ('unreviewed','reviewing','acting','done')),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_reg_effective on regulations (effective_date);
create index idx_reg_type      on regulations (reg_type, announce_date desc);

-- ---------------------------------------------------------
-- 3.4 태그 (룰 기반 자동분류 — AI 불필요)
-- ---------------------------------------------------------
create table tag_rules (
  id          serial primary key,
  keyword     text not null,          -- 위반내용/회수사유에서 찾을 키워드
  tag         text not null,          -- 부여할 태그
  target      text not null default 'all' check (target in ('disposition','recall','all')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 폴리모픽 태그 연결 (FK 없음 — item_type으로 구분)
create table item_tags (
  item_type   text not null check (item_type in ('disposition','recall','regulation')),
  item_id     uuid not null,
  tag         text not null,
  tagged_by   text not null default 'rule' check (tagged_by in ('rule','manual')),
  primary key (item_type, item_id, tag)
);
create index idx_tags_tag on item_tags (tag);

-- 초기 태그 룰 시드
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

-- ---------------------------------------------------------
-- 3.5 보드 (개인/공용)
-- ---------------------------------------------------------
create table boards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid not null references auth.users(id),
  is_shared   boolean not null default false,   -- true면 팀 전체 조회 가능 (RLS)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- 기본 보드 시드 (앱 최초 로그인 시 자동 생성 로직으로 구현)
-- '자사 영향 검토', '즉시조치 필요', 'OEM·ODM 모니터링',
-- '표시·광고 사례', '경영진 보고대상', '조치 완료'

create table board_items (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards(id) on delete cascade,
  item_type   text not null check (item_type in ('disposition','recall','regulation')),
  item_id     uuid not null,
  memo        text,
  added_by    uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (board_id, item_type, item_id)
);

-- ---------------------------------------------------------
-- 3.6 조치관리 (저장과 조치를 분리 — Q-Radar 차별점)
-- ---------------------------------------------------------
create table actions (
  id              uuid primary key default gen_random_uuid(),
  item_type       text not null check (item_type in ('disposition','recall','regulation')),
  item_id         uuid not null,
  related_brand   text,              -- 예: 랩노쉬
  related_products text,             -- 콤마 구분 자유입력 (Phase 3에서 partners와 연결)
  assignee        text not null,     -- 담당자명
  due_date        date,
  status          text not null default 'open' check (status in
                    ('open','in_progress','done','cancelled')),
  review_opinion  text,              -- 검토의견
  action_detail   text,              -- 조치내역
  evidence_url    text,              -- 증빙 파일 (Supabase Storage 경로)
  approved_by     text,              -- 최종 승인자
  approved_at     timestamptz,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_actions_status on actions (status, due_date);

-- ---------------------------------------------------------
-- 3.7 수집 이력 (데이터 신선도 = 이 보드의 신뢰성)
-- ---------------------------------------------------------
create table collection_runs (
  id              uuid primary key default gen_random_uuid(),
  source_name     text not null,     -- 'disposition_food_mnft' 등 §2 소스별 식별자
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text check (status in ('success','partial','failed')),
  records_fetched int default 0,
  records_new     int default 0,
  error_message   text
);
create index idx_runs_source on collection_runs (source_name, started_at desc);

-- ---------------------------------------------------------
-- 3.8 협력사 마스터 (Phase 3 대비 — 테이블만 선점, MVP에서 UI 미구현)
-- ---------------------------------------------------------
create table partners (
  id              uuid primary key default gen_random_uuid(),
  partner_name    text not null,
  partner_type    text check (partner_type in ('oem','odm','raw_material','logistics','other')),
  brand_scope     text,              -- 관련 자사 브랜드
  license_no      text,              -- 매칭 키 (인허가번호)
  aliases         text[],            -- 상호 변경 이력·법인명 표기 변형 대응
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
-- Phase 3 매칭 로직: dispositions.company_name / recalls.company_name을
-- partners.partner_name + aliases와 trigram 유사도 매칭 → company_relevance 자동 갱신

-- ---------------------------------------------------------
-- 3.9 RLS (Row Level Security) — Supabase 필수
-- ---------------------------------------------------------
alter table boards       enable row level security;
alter table board_items  enable row level security;
alter table actions      enable row level security;

create policy "boards_owner_or_shared" on boards for select
  using (owner_id = auth.uid() or is_shared = true);
create policy "boards_owner_write" on boards for all
  using (owner_id = auth.uid());
-- board_items, actions는 소속 보드/작성자 기준 동일 패턴으로 소넷이 작성

-- 데이터 테이블(dispositions/recalls/regulations)은 로그인 사용자 전체 read,
-- write는 service_role(수집 잡)만 허용.
```

---

## 4. 착수 시 소넷이 가장 먼저 확인할 것 (순서대로)

1. **국가법령정보센터 API 검증** (§2 #7): open.law.go.kr Open API의 신청 절차·응답 포맷을 확인. 만약 API 승인에 시간이 걸리면 regulations 테이블은 수동 입력 폼으로 먼저 열고 자동수집은 후순위로 미룬다. **법령 수집이 막혀도 행정처분·회수 기능 출시를 지연시키지 말 것.**
2. **행정처분 API 4종 응답 필드 실사**: Swagger에서 실제 필드명 확인 후 §3.1 컬럼과 매핑표 작성. API가 일련번호를 제공하지 않으면 `source_key = md5(company_name || disposition_date || violation_content)`.
3. **DATA_GO_KR_API_KEY 발급**: 공공데이터포털 회원가입 → 활용신청(자동승인) → 키 발급. 이 단계는 사용자(Jay)가 직접 수행해야 하므로, 개발 시작 시 안내 메시지로 요청할 것.

## 5. 위험도 점수 공식 (룰 기반 — AI 미사용)

```
[행정처분]
base = 처분유형별 기본점수
  영업소폐쇄·등록취소: 90 / 영업정지: 70 / 품목제조정지: 60
  과징금: 50 / 공표·회수폐기: 45 / 시정명령: 30 / 기타: 20
+10 : 위반내용에 안전 키워드 포함 (미생물|이물|위해|중금속|잔류농약)
+5  : 위반내용에 표시광고 키워드 포함 (질병|치료|예방|허위|과대)
상한 100

[회수]
1등급: 95 / 2등급: 70 / 3등급: 50 / 미분류: 40

[레벨 매핑]
score >= 80 → critical / 60~79 → high / 40~59 → medium / <40 → low
```

수집 파이프라인에서 insert 시점에 계산해 저장. 공식 변경 시 전체 재계산 배치 스크립트도 함께 작성할 것.

## 6. 카드 요약문 — 템플릿 생성 (AI 미사용)

```
[행정처분] "{company_name}은(는) {violation_law} 위반으로 {disposition_date}
{disposition_detail} 처분을 받았습니다. 처분기관: {disposition_agency}"

[회수] "{product_name}({company_name})이 {recall_reason}(으)로
{recall_grade} 회수 조치되었습니다."

[법령] "{title} — 공포 {announce_date}, 시행 {effective_date} (D-{n})"
```

## 7. UI 구성 (Winning Radar 구조 이식)

- **좌측 사이드바**: 위해·행정정보(행정처분/회수·판매중지) > 규제정보(법령·고시) > 나의 보드. 각 항목 옆 건수 배지. **화장품 카테고리는 "수동 등록" 라벨을 붙여 빈 화면 오해 방지.**
- **상단 필터**: 분야 / 정보유형 / 위반유형(태그) / 처분유형 / 기간(7·30·90일·직접) / 위험도 / 조치상태 — 다중선택, URL 쿼리스트링에 상태 저장(공유 가능하게).
- **카드**: 위험도 배지(색상: critical=빨강, high=주황, medium=노랑, low=회색) + 업체/제품명 + 템플릿 요약 + 태그칩 + [공식 원문] [보드 저장] 버튼.
- **상세**: 전체 필드 + raw_data 접기/펼치기 + 조치관리 폼(§3.6) + 동일 업체 이력(company_name 기준 조회).
- **헤더**: 최근 동기화 시각 + 수집 실패 시 경고 배너 (collection_runs 최신 status 기준).
- **고지문**: §1 문구를 목록 하단 고정.

## 8. 수집 파이프라인 규칙

- Vercel Cron 매일 07:00 KST 실행 (`vercel.json`의 crons 설정).
- 소스별 독립 실행: 하나가 실패해도 나머지는 계속 (status='partial' 기록).
- 증분 수집: 최근 90일 조회 → source_key 기준 upsert (`on conflict do nothing` + 변경 필드만 update).
- 모든 실행을 collection_runs에 기록. 3회 연속 실패 시 대시보드에 경고 노출.

## 9. Phase 로드맵 (MVP 이후 — 지금 구현하지 말 것)

| Phase | 내용 | 선행 조건 |
|---|---|---|
| 2 | 화장품 행정처분 크롤러 + 검수 큐 | 식약처 공고 게시판 구조 분석 |
| 3 | 협력사 자동 매칭 (company_relevance 자동화) | partners 마스터 데이터 입력 완료 |
| 4 | AI 요약·법령 신구조문 비교 (Claude API) | 실사용 2~4주 후 필요 기능 확정, API 비용 승인 |
| 5 | 팀 공유·권한 세분화, 주간 규제 리포트 자동 생성 | 팀 온보딩 |

## 10. 환경변수

```
DATA_GO_KR_API_KEY=        # 공공데이터포털 인증키 (사용자 발급)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= # 수집 잡 전용, 클라이언트 노출 금지
LAW_GO_KR_API_KEY=         # 법제처 API (승인 후)
```
