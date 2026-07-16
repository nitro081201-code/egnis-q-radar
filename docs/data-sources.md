# 데이터 소스 조사 결과 (Gate 3 착수 전 리서치)

API 키 없이 data.go.kr / foodsafetykorea.go.kr 공개 페이지만으로 확인 가능한 범위까지 조사한 결과.
`DATA_GO_KR_API_KEY` 발급 전 반드시 확인해야 할 사항이 있어 착수 전에 기록한다.

## ⚠️ 중요 발견: 인증키가 하나가 아니다

스펙(q-radar-spec-v1.md §2, §4)은 `DATA_GO_KR_API_KEY` 하나로 행정처분 API 4종을 전부
쓸 수 있다고 가정했지만, 실제로는 **두 종류의 서로 다른 API 게이트웨이**가 섞여 있다.

| 유형 | 게이트웨이 | 인증키 | 해당 소스 |
|---|---|---|---|
| A. data.go.kr 자체 호스팅 REST | `apis.data.go.kr/...` | `DATA_GO_KR_API_KEY` (공공데이터포털 활용신청) | #1 식품제조가공업, #2 식품판매업 (확인됨). #4 수입식품업, #5·#6 회수도 이 유형일 가능성 높음(§4 참고) |
| B. 식품안전나라(MFDS) 자체 게이트웨이로 연결(LINK형) | `openapi.foodsafetykorea.go.kr/api/{keyId}/{serviceId}/...` | **별도의 keyId** — foodsafetykorea.go.kr에서 따로 발급 | #3 식품접객업 (확인됨) |

**즉, `#3 식품접객업`을 자동 수집하려면 공공데이터포털 키와 별개로 식품안전나라
Open API 키를 추가로 신청해야 한다.** 사용자가 키 발급을 시작하기 전에 이 사실을
알아야 신청을 한 번에 끝낼 수 있다.

## 확인된 엔드포인트

| # | 소스 | 요청 URL | 인증 | 상태 |
|---|---|---|---|---|
| 1 | 행정처분(식품제조가공업) | `http://apis.data.go.kr/1471000/AdmmRsltFoodMnftPrcsService/getAdmmRsltFoodMnftPrcsBssh` | DATA_GO_KR_API_KEY | 엔드포인트 도달 확인(401 Unauthorized로 응답 — 키만 있으면 호출 가능). **응답 필드명은 Swagger UI가 JS 렌더링이라 미확인, 실제 키로 1회 호출 필요** |
| 2 | 행정처분(식품판매업) | `http://apis.data.go.kr/1471000/AdmmRsltFoodSaleService/getAdmmRsltFoodSaleBssh` | DATA_GO_KR_API_KEY | 위와 동일 (401 확인, 필드명 미확인) |
| 3 | 행정처분(식품접객업) | `http://openapi.foodsafetykorea.go.kr/api/{keyId}/I2630/{json|xml}/{startIdx}/{endIdx}` | **foodsafetykorea keyId (별도 발급)** | **필드명까지 전부 확인됨 — 아래 표 참고** |
| 4 | 행정처분(수입식품업) | 미확인 | 미확인 | data.go.kr에 "행정처분결과(수입식품업)"으로 검색 필요, 착수 시 재확인 |
| 5 | 식품 회수·판매중지 | data.go.kr/data/15074318 | 미확인(REST/LINK 여부 포함) | 착수 시 재확인 |
| 6 | 수입식품 회수·판매중지 | `IprtFoodReclSaleStopPrdtStusService` (data.go.kr/data/15095378) | 추정 DATA_GO_KR_API_KEY (REST형 이름 패턴) | 착수 시 재확인 |
| 7 | 법령·고시 (open.law.go.kr) | 미조사 | 별도 키(법제처) | Gate 3 후반 착수 |

## #3 식품접객업(I2630) — 완전히 확인된 응답 필드

요청: `http://openapi.foodsafetykorea.go.kr/api/{keyId}/I2630/json/{startIdx}/{endIdx}`
선택 파라미터: `CHNG_DT`(변경일자), `DSPS_DCSNDT`(확정일자), `LCNS_NO`(인허가번호) — 전부 YYYYMMDD

| 필드명 | 의미 | dispositions 매핑 |
|---|---|---|
| `PRCSCITYPOINT_BSSHNM` | 업소명 | `company_name` |
| `INDUTY_CD_NM` | 업종 | `business_type` |
| `LCNS_NO` | 인허가번호(원문) | 마스킹·해시 후 폐기 → `license_no_masked`, `license_no_hash` |
| `DSPS_DCSNDT` | 처분확정일자 | `disposition_date` |
| `DSPS_BGNDT` / `DSPS_ENDDT` | 처분 시작/종료일(영업정지 등) | 현재 스키마에 대응 컬럼 없음 — `disposition_detail` 텍스트에 포함 |
| `DSPS_TYPECD_NM` | 처분유형(원문) | `disposition_type_raw` → 정규화해서 `disposition_type_normalized` |
| `VILTCN` | 위반일자및위반내용(형식 미확인, 합쳐진 문자열로 추정) | `violation_content` (날짜 분리는 실제 응답 보고 나서 결정) |
| `ADDR` | 주소(전체, PII) | 시/도만 추출해 `region`, 나머지 폐기 |
| `TEL_NO` | 전화번호 | **저장 금지** (개인정보 최소화 원칙) |
| `PRSDNT_NM` | 대표자명 | **저장 금지** |
| `DSPSCN` | 처분내용 | `disposition_detail` |
| `LAWORD_CD_NM` | 위반법령 | `violation_law` |
| `PUBLIC_DT` | 공개기한 | `public_until` (파싱 실패 시 quarantined 유지) |
| `LAST_UPDT_DTM` | 최종수정일 | `source_updated_at` |
| `DSPS_INSTTCD_NM` | 처분기관명 | `disposition_agency` |
| `DSPSDTLS_SEQ` | 행정처분전산키(고유값) | `source_key = "I2630:" + DSPSDTLS_SEQ` |

## 다음에 할 일

1. 사용자가 공공데이터포털 키 발급 시 **식품안전나라 Open API 키도 함께 신청**하도록 안내 (아래 Gate 3 착수 체크리스트 참고)
2. 키 확보 후 #1, #2, #4, #5, #6를 실제로 1회씩 호출해 응답 필드명 확정 → 이 문서에 표 추가
3. #3(식품접객업)은 필드 매핑이 이미 끝나 있으므로 키만 있으면 바로 파서 구현 가능 (뼈대 코드는 이미 작성됨, 아래 참고)
