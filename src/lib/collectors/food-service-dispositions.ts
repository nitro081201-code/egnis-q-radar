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

// 식품안전나라(foodsafetykorea.go.kr) Open API — 행정처분결과(식품접객업), 서비스ID I2630.
// data.go.kr(15058429)에서는 LINK형으로 이 API로 연결되며, 인증키는 공공데이터포털이 아니라
// 식품안전나라에서 별도로 발급받아야 한다 (docs/data-sources.md 참고).
// 응답 envelope 구조 및 필드 형식은 인증 없는 샘플 엔드포인트
// (openapi.foodsafetykorea.go.kr/api/sample/I2630/json/1/5) 실 응답으로 검증 완료.

const SERVICE_ID = "I2630";
const PAGE_SIZE = 100;
const MAX_PAGES = 5; // 최초 안전장치 — 실제 응답 확인 후 페이지네이션 전략을 재조정할 것

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
  if (resultCode && resultCode !== "INFO-000" && resultCode !== "INFO-200") {
    // INFO-200: 해당 페이지에 더 이상 데이터 없음(정상 종료 신호로 취급)
    if (resultCode === "INFO-200") return [];
    throw new Error(`${SERVICE_ID} 오류 응답: ${resultCode} ${service.RESULT?.MSG ?? ""}`);
  }
  return service.row ?? [];
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
    category: "food",
    business_type: raw.INDUTY_CD_NM ?? "식품접객업",
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
    source_url: "https://www.data.go.kr/data/15058429/openapi.do",
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

export function createFoodServiceDispositionsCollector(apiKey: string): Collector {
  return {
    sourceName: "disposition_food_service",
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
