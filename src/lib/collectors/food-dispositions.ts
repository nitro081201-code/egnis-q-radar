import type { CollectedRow, Collector } from "./types";
import {
  calcDispositionRisk,
  extractRegion,
  maskAndHashLicenseNo,
  normalizeDispositionType,
  parseDateLoose,
  parseViltcn,
  parseYyyymmdd,
} from "./util";

// 식품안전나라(foodsafetykorea.go.kr) Open API — 행정처분결과(전체), 서비스ID I0470.
// 업종(INDUTY_CD_NM)이 식품제조가공업/식품판매업/식품접객업/수입식품업 등을 전부 포함하는
// 통합 데이터셋임을 실키로 확인함(2026-07-17, 5,372건, 23개 업종 확인) — 애초 스펙(§2)이
// 4개로 나눠 생각했던 업종별 API를 이거 하나로 커버 가능해 별도 API 4개를 쫓아다닐 필요가 없다.
// 응답 envelope/필드 형식은 인증 없는 샘플 엔드포인트로 먼저 검증(I2630과 필드 100% 동일),
// 이후 실키로 전체 데이터 재검증 완료.
//
// ⚠️ total_count가 5천 건대라 90일 증분 수집 전략은 아직 미정 (API가 날짜 "범위" 필터를
// 지원하지 않고 CHNG_DT 정확히 일치만 지원함 — docs/data-sources.md 참고). 지금은 안전하게
// MAX_PAGES로 상한만 두고, 매일 갱신분이 상한 안에 들어오는지는 운영 투입 전 재점검 필요.

const SERVICE_ID = "I0470";
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // 최초 안전장치(최대 2000건/회) — Vercel 함수 실행시간 제약 고려해 운영 투입 전 재조정할 것

interface RawRow {
  PRCSCITYPOINT_BSSHNM?: string;
  INDUTY_CD_NM?: string;
  LCNS_NO?: string;
  DSPS_DCSNDT?: string;
  DSPS_TYPECD_NM?: string;
  VILTCN?: string;
  ADDR?: string;
  DSPSCN?: string;
  LAWORD_CD_NM?: string;
  PUBLIC_DT?: string;
  LAST_UPDT_DTM?: string;
  DSPS_INSTTCD_NM?: string;
  DSPSDTLS_SEQ?: string;
}

async function fetchPage(apiKey: string, startIdx: number, endIdx: number): Promise<RawRow[]> {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${apiKey}/${SERVICE_ID}/json/${startIdx}/${endIdx}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${SERVICE_ID} 요청 실패: HTTP ${res.status}`);
  }
  const body = await res.json();
  const service = body[SERVICE_ID];
  if (!service) {
    throw new Error(`${SERVICE_ID} 응답 형식 예상과 다름: ${JSON.stringify(body).slice(0, 300)}`);
  }
  const resultCode = service.RESULT?.CODE;
  if (resultCode && resultCode !== "INFO-000") {
    if (resultCode === "INFO-200") return [];
    throw new Error(`${SERVICE_ID} 오류 응답: ${resultCode} ${service.RESULT?.MSG ?? ""}`);
  }
  return service.row ?? [];
}

/** dispositions.category check 제약: food/health_functional/imported_food/cosmetic */
function mapCategory(indutyCdNm: string | undefined): "food" | "health_functional" | "imported_food" {
  const v = indutyCdNm ?? "";
  if (v.includes("수입식품")) return "imported_food";
  if (v.includes("건강기능식품")) return "health_functional";
  return "food";
}

function parseRow(raw: RawRow): CollectedRow | null {
  if (!raw.DSPSDTLS_SEQ) return null; // 고유키 생성 실패 -> 이 행은 건너뜀(quarantined 대상조차 못 됨)

  const companyName = raw.PRCSCITYPOINT_BSSHNM?.trim();
  const { masked: licenseNoMasked, hash: licenseNoHash } = maskAndHashLicenseNo(raw.LCNS_NO);
  const dispositionDate = parseYyyymmdd(raw.DSPS_DCSNDT);
  // PUBLIC_DT는 파라미터 문서상 YYYYMMDD로 안내되어 있으나 실제 응답은
  // "YYYY-MM-DD HH:MM:SS.s" 타임스탬프로 옴 (샘플 응답으로 확인).
  const publicUntil = parseDateLoose(raw.PUBLIC_DT);
  const dispositionTypeNormalized = normalizeDispositionType(raw.DSPS_TYPECD_NM);
  const { date: violationDate, content: violationContent } = parseViltcn(raw.VILTCN);
  const { score, level } = calcDispositionRisk(dispositionTypeNormalized, violationContent);

  const qualityOk = Boolean(companyName && dispositionDate && publicUntil);

  return {
    source_key: `${SERVICE_ID}:${raw.DSPSDTLS_SEQ}`,
    category: mapCategory(raw.INDUTY_CD_NM),
    business_type: raw.INDUTY_CD_NM ?? null,
    company_name: companyName ?? "",
    region: extractRegion(raw.ADDR),

    license_no_masked: licenseNoMasked,
    license_no_hash: licenseNoHash,

    violation_law: raw.LAWORD_CD_NM ?? null,
    violation_content: violationContent,
    violation_date: violationDate,

    disposition_type_raw: raw.DSPS_TYPECD_NM ?? null,
    disposition_type_normalized: dispositionTypeNormalized,
    disposition_detail: raw.DSPSCN ?? null,
    disposition_date: dispositionDate,
    disposition_agency: raw.DSPS_INSTTCD_NM ?? null,

    risk_score: score,
    risk_level: level,

    source_type: "api_mfds",
    source_url: "https://www.foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=I0470",
    sanitized_raw_data: {
      // allowlist만 — PRSDNT_NM(대표자명), TEL_NO(전화번호), ADDR 원문은 절대 포함하지 않는다.
      DSPSDTLS_SEQ: raw.DSPSDTLS_SEQ,
      PRCSCITYPOINT_BSSHNM: raw.PRCSCITYPOINT_BSSHNM,
      INDUTY_CD_NM: raw.INDUTY_CD_NM,
      DSPS_DCSNDT: raw.DSPS_DCSNDT,
      DSPS_TYPECD_NM: raw.DSPS_TYPECD_NM,
      VILTCN: raw.VILTCN,
      DSPSCN: raw.DSPSCN,
      LAWORD_CD_NM: raw.LAWORD_CD_NM,
      PUBLIC_DT: raw.PUBLIC_DT,
      DSPS_INSTTCD_NM: raw.DSPS_INSTTCD_NM,
    },

    public_until: publicUntil,
    source_updated_at: raw.LAST_UPDT_DTM ?? null,
    last_seen_at: new Date().toISOString(),

    status: qualityOk ? "published" : "quarantined",
    visibility_status: qualityOk ? "visible" : "quarantined",
  };
}

export function createFoodDispositionsCollector(apiKey: string): Collector {
  return {
    sourceName: "disposition_food",
    table: "dispositions",
    async collect() {
      const rows: CollectedRow[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const start = page * PAGE_SIZE + 1;
        const end = start + PAGE_SIZE - 1;
        const raw = await fetchPage(apiKey, start, end);
        if (raw.length === 0) break;
        for (const r of raw) {
          const parsed = parseRow(r);
          if (parsed) rows.push(parsed);
        }
        if (raw.length < PAGE_SIZE) break;
      }
      return rows;
    },
  };
}
