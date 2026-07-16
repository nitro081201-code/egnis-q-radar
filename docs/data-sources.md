# 데이터 소스 조사 결과 (Gate 3)

## ⚠️ 중요 발견: 인증키가 하나가 아니다

스펙(q-radar-spec-v1.md §2, §4)은 `DATA_GO_KR_API_KEY` 하나로 행정처분 API 4종을 전부
쓸 수 있다고 가정했지만, 실제로는 **두 종류의 서로 다른 API 게이트웨이**가 섞여 있다.

| 유형 | 게이트웨이 | 인증키 | 해당 소스 |
|---|---|---|---|
| A. data.go.kr 자체 호스팅 REST | `apis.data.go.kr/...` | `DATA_GO_KR_API_KEY` (공공데이터포털 활용신청) | #1 식품제조가공업, #2 식품판매업, #6 수입식품 회수·판매중지 (모두 확인됨) |
| B. 식품안전나라(MFDS) 자체 게이트웨이로 연결(LINK형) | `openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/...` | **별도의 keyId** — foodsafetykorea.go.kr에서 따로 발급 | #3 식품접객업, #5 식품 회수·판매중지 (모두 확인됨) |

**즉 공공데이터포털 키와 별개로 식품안전나라 Open API 키도 반드시 신청해야 한다.**

## ✅ 추가 발견: 인증 없는 샘플 엔드포인트로 필드 매핑을 실제 검증함

`openapi.foodsafetykorea.go.kr/api/sample/{serviceId}/json/{start}/{end}` 로 키 없이도
**실제 라이브 데이터**를 호출할 수 있다 (`keyId` 자리에 `sample` 사용). 이걸로 #3, #5의
파서를 실제 응답으로 검증 완료했고, 문서상 안내와 다른 부분 2건을 발견해 고쳤다:

- `PUBLIC_DT`(I2630)는 파라미터 문서엔 YYYYMMDD라고 되어 있지만 실제로는
  `"2026-08-01 00:00:00.0"` 형식의 타임스탬프로 온다.
- `VILTCN`(I2630, 위반일자및위반내용)은 `"(20260512)영업정지"`처럼 날짜와 내용이 합쳐진
  문자열이며, 괄호 안 8자리가 날짜다.
- `DISTBTMLMT`/`MNFDT`(I0490, 소비기한/제조일자)는 형식이 들쭉날쭉함:
  `"2027-07-05"`, `"2029.1.30"`, `"제조일로부터 9개월"`(날짜 아님), `"데이터없음"`(값 없음).
  날짜로 명확히 파싱되는 것만 저장하고 나머지는 null 처리 (추측 계산 금지).

`src/lib/collectors/`의 파서 2종(식품접객업, 회수)은 이 방식으로 실제 데이터를 넣어
end-to-end 테스트(수집 → 파싱 → DB upsert → collection_runs 기록)까지 통과시켰다.

## 확인된 엔드포인트

| # | 소스 | 요청 URL | 인증 | 상태 |
|---|---|---|---|---|
| 1 | 행정처분(식품제조가공업) | `http://apis.data.go.kr/1471000/AdmmRsltFoodMnftPrcsService/getAdmmRsltFoodMnftPrcsBssh` | DATA_GO_KR_API_KEY | 엔드포인트 도달 확인(401). **필드명은 실키 필요 — sample 엔드포인트 없음** |
| 2 | 행정처분(식품판매업) | `http://apis.data.go.kr/1471000/AdmmRsltFoodSaleService/getAdmmRsltFoodSaleBssh` | DATA_GO_KR_API_KEY | 위와 동일 |
| 3 | 행정처분(식품접객업) | `http://openapi.foodsafetykorea.go.kr/api/{keyId}/I2630/json/{start}/{end}` | foodsafetykorea keyId | **파서 완성, 실 데이터 검증 완료** (`src/lib/collectors/food-service-dispositions.ts`) |
| 4 | 행정처분(수입식품업) | **미확정** — `I0470`("행정처분결과", svc_no 확인됨)이 후보. sample 호출 결과 업종이 "유통전문판매업"/"유흥주점영업" 등 다양하게 섞여 나와 이게 수입식품업 전용인지 전체 통합본인지 불명확 | 미정 | 실키로 `LCNS_NO` 등 파라미터 필터링하며 재확인 필요 |
| 5 | 식품 회수·판매중지 | `http://openapi.foodsafetykorea.go.kr/api/{keyId}/I0490/json/{start}/{end}` | foodsafetykorea keyId | **파서 완성, 실 데이터 검증 완료** (`src/lib/collectors/food-recalls.ts`) |
| 6 | 수입식품 회수·판매중지 | `http://apis.data.go.kr/1471000/IprtFoodReclSaleStopPrdtStusService/getIprtFoodReclSaleStopPrdtStusInq` | DATA_GO_KR_API_KEY | 엔드포인트만 확인, 필드명은 실키 필요 |
| 7 | 법령·고시 (open.law.go.kr) | 미조사 | 별도 키(법제처) | Gate 3 후반 착수 |

## #3 식품접객업(I2630) — 검증된 응답 필드

| 필드명 | 의미 | dispositions 매핑 |
|---|---|---|
| `PRCSCITYPOINT_BSSHNM` | 업소명 | `company_name` |
| `INDUTY_CD_NM` | 업종 | `business_type` |
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
| `DSPSDTLS_SEQ` | 고유값 | `source_key = "I2630:" + DSPSDTLS_SEQ` |

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

1. #4(수입식품업 행정처분)와 #6(수입식품 회수)는 실키 확보 후 1회 호출해서 확정
2. #7(법령·고시, open.law.go.kr)은 별도 조사 필요 — 법제처 API 신청 절차 포함
3. #1, #2도 실키로 1회 호출해 필드명 확정 후 파서 작성 (구조는 #3·#5와 거의 동일할 것으로 예상)
