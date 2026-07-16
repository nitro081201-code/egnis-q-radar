# 데이터 소스 조사 결과 (Gate 3)

## ✅ 결론: 행정처분 4종(#1~#4) 전부 I0470 하나로 해결됨

스펙(q-radar-spec-v1.md §2)은 업종별로 API 4개(식품제조가공업/식품판매업/식품접객업/
수입식품업)가 따로 있다고 가정했지만, 실제로는 **식품안전나라(foodsafetykorea.go.kr)의
통합 서비스 I0470("행정처분결과") 하나가 전체 업종을 다 포함**한다. 실키로 확인
(2026-07-17): 2,000건 수집 시 `food` 1,591건 / `health_functional` 303건 /
`imported_food` 11건 — 업종 분류(`INDUTY_CD_NM`)로 구분되는 것이지 API 자체가
나뉘어 있는 게 아니었다. `I2630`(식품접객업 전용, 처음에 이걸로 시작함)은 I0470의
부분집합이라 지금은 안 쓴다(`src/lib/collectors/food-dispositions.ts` 하나로 통합).

**즉 이 프로젝트의 행정처분·회수 수집은 `FOODSAFETYKOREA_API_KEY` 키 하나로 전부
해결된다.** `DATA_GO_KR_API_KEY`는 #6(수입식품 회수·판매중지, 별도 REST API 확인됨)
말고는 필요 없을 가능성이 높다.

## 확인된 엔드포인트

| # | 소스 | 요청 URL | 인증 | 상태 |
|---|---|---|---|---|
| 1~4 | 행정처분(전 업종 통합) | `http://openapi.foodsafetykorea.go.kr/api/{keyId}/I0470/json/{start}/{end}` | `FOODSAFETYKOREA_API_KEY` | **파서 완성, 실키로 프로덕션 DB 수집 완료** (`src/lib/collectors/food-dispositions.ts`) — food/health_functional/imported_food 전부 이걸로 커버 |
| 5 | 식품 회수·판매중지 | `http://openapi.foodsafetykorea.go.kr/api/{keyId}/I0490/json/{start}/{end}` | `FOODSAFETYKOREA_API_KEY` | **파서 완성, 실키로 프로덕션 DB 수집 완료** (`src/lib/collectors/food-recalls.ts`) |
| 6 | 수입식품 회수·판매중지 | `http://apis.data.go.kr/1471000/IprtFoodReclSaleStopPrdtStusService/getIprtFoodReclSaleStopPrdtStusInq` | `DATA_GO_KR_API_KEY` | 엔드포인트만 확인, 필드명은 실키 필요 (아직 미발급) |
| 7 | 법령·고시 (open.law.go.kr) | 미조사 | 별도 키(법제처) | Gate 3 후반 착수 |

## 실키로 검증하며 잡은 버그 3건

인증 없는 샘플 엔드포인트(`openapi.foodsafetykorea.go.kr/api/sample/{serviceId}/...`,
`keyId` 자리에 `sample`)로 실제 라이브 데이터를 먼저 확인하고, 이후 실키로 대량 검증했다.

1. `PUBLIC_DT`는 파라미터 문서엔 YYYYMMDD라고 되어 있지만 실제로는
   `"2026-08-01 00:00:00.0"` 형식의 타임스탬프로 온다 — 처음엔 전량 quarantined 처리되던 버그.
2. `VILTCN`(위반일자및위반내용)은 `"(20260512)영업정지"`처럼 날짜와 내용이 합쳐진
   문자열이며, 괄호 안 8자리가 날짜다 — 분리 파싱 추가.
3. 페이지네이션(20페이지 x 100건) 도중 원본 데이터가 갱신되면서 동일 `source_key`가
   여러 페이지에 걸쳐 중복 등장 → 배치 upsert가 "ON CONFLICT DO UPDATE command cannot
   affect row a second time" 에러로 실패 → `runCollector`에서 upsert 직전 `source_key`
   기준 중복 제거하도록 수정 (`src/lib/collectors/run.ts`).

`DISTBTMLMT`/`MNFDT`(I0490, 소비기한/제조일자)는 형식이 들쭉날쭉함:
`"2027-07-05"`, `"2029.1.30"`, `"제조일로부터 9개월"`(날짜 아님), `"데이터없음"`(값 없음).
날짜로 명확히 파싱되는 것만 저장하고 나머지는 null 처리 (추측 계산 금지).

## #1~4 행정처분(I0470) — 검증된 응답 필드

| 필드명 | 의미 | dispositions 매핑 |
|---|---|---|
| `PRCSCITYPOINT_BSSHNM` | 업소명 | `company_name` |
| `INDUTY_CD_NM` | 업종 (23종 확인: 식품제조가공업/일반음식점/수입식품등 수입판매업 등) | `business_type`, 및 `category` 분류 근거 |
| `LCNS_NO` | 인허가번호(원문) | 마스킹·해시 후 폐기 → `license_no_masked`, `license_no_hash` |
| `DSPS_DCSNDT` | 처분확정일자(YYYYMMDD) | `disposition_date` |
| `DSPS_TYPECD_NM` | 처분유형(원문) | `disposition_type_raw` → 정규화해서 `disposition_type_normalized` |
| `VILTCN` | `"(YYYYMMDD)내용"` 합쳐진 문자열 | 분리해서 `violation_date` / `violation_content` |
| `ADDR` | 주소(전체, PII) | 시/도만 추출해 `region`, 나머지 폐기 |
| `TEL_NO`, `PRSDNT_NM` | 전화번호, 대표자명 | **저장 금지** |
| `DSPSCN` | 처분내용 | `disposition_detail` |
| `LAWORD_CD_NM` | 위반법령 | `violation_law` |
| `PUBLIC_DT` | 공개기한("YYYY-MM-DD HH:MM:SS.s") | `public_until` (파싱 실패 시 quarantined) |
| `LAST_UPDT_DTM` | 최종수정일 | `source_updated_at` |
| `DSPS_INSTTCD_NM` | 처분기관명 | `disposition_agency` |
| `DSPSDTLS_SEQ` | 고유값 | `source_key = "I0470:" + DSPSDTLS_SEQ` |

`category` 매핑 규칙: `INDUTY_CD_NM`에 "수입식품" 포함 → `imported_food`,
"건강기능식품" 포함 → `health_functional`, 그 외 → `food`.

## #5 식품 회수·판매중지(I0490) — 검증된 응답 필드

| 필드명 | 의미 | recalls 매핑 |
|---|---|---|
| `PRDTNM` | 제품명 | `product_name` |
| `BSSHNM` | 업체명 | `company_name` |
| `ADDR` | 주소(전체, PII) | 시/도만 추출해 `region` |
| `RTRVL_GRDCD_NM` | 회수등급("1등급"~"3등급"/"미분류") | `recall_grade_raw` / `recall_grade_normalized` |
| `RTRVLPRVNS` | 회수사유 | `recall_reason` |
| `RTRVLPLANDOC_RTRVLMTHD` | 회수방법 | `recall_method` |
| `PRDLST_REPORT_NO` | 품목제조보고번호 | `item_report_no` |
| `BRCDNO` | 바코드 | `barcode` |
| `DISTBTMLMT` | 소비/유통기한(형식 들쭉날쭉) | `expiry_date` (파싱 안 되면 null) |
| `MNFDT` | 제조일자("데이터없음" 가능) | `manufacture_date` |
| `IMG_FILE_PATH` | 제품사진 URL(콤마 구분 다중) | 첫 번째만 `product_image_url` |
| `CRET_DTM` | 등록일시 | `registered_date` |
| `PRDLST_TYPE` | 품목유형("가공식품"/"건강기능식품" 등) | `category` (건강기능식품→health_functional, 그 외→food) |
| `LCNS_NO`, `TELNO` | 인허가번호 원문, 전화번호 | **저장 금지** (recalls 테이블엔 인허가번호 컬럼 자체가 없음) |

## 남은 일

1. #6(수입식품 회수·판매중지)는 `DATA_GO_KR_API_KEY` 발급 후 1회 호출해서 필드명 확정
2. #7(법령·고시, open.law.go.kr)은 별도 조사 필요 — 법제처 API 신청 절차 포함
3. `MAX_PAGES=20`(최대 2,000건/회) 안전장치를 실제로 매일 얼마나 새로 생기는지 보고
   운영 투입 전 재조정할 것 — API가 날짜 "범위" 필터를 지원하지 않아(정확히 일치만 지원)
   90일 증분 수집 전략은 아직 미정
