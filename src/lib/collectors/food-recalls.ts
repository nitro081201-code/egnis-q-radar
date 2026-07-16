import type { CollectedRow, Collector } from "./types";
import {
  calcRecallRisk,
  extractRegion,
  normalizeRecallGrade,
  parseDateLoose,
  parseFlexibleDate,
} from "./util";

// 식품안전나라(foodsafetykorea.go.kr) Open API — 식품 회수·판매중지 정보, 서비스ID I0490.
// data.go.kr(15074318)에서도 LINK형으로 이 API로 연결되며, FOODSAFETYKOREA_API_KEY 필요.
// 응답 envelope 및 필드는 인증 없는 샘플 엔드포인트
// (openapi.foodsafetykorea.go.kr/api/sample/I0490/json/1/5) 실 응답으로 검증 완료.

const SERVICE_ID = "I0490";
const PAGE_SIZE = 100;
const MAX_PAGES = 5; // 최초 안전장치 — 운영 투입 전 페이지네이션 전략 재조정할 것

interface RawRow {
  RTRVLDSUSE_SEQ?: string;
  PRDTNM?: string;
  BSSHNM?: string;
  ADDR?: string;
  RTRVL_GRDCD_NM?: string;
  RTRVLPRVNS?: string;
  RTRVLPLANDOC_RTRVLMTHD?: string;
  PRDLST_REPORT_NO?: string;
  BRCDNO?: string;
  DISTBTMLMT?: string;
  MNFDT?: string;
  IMG_FILE_PATH?: string;
  CRET_DTM?: string;
  PRDLST_TYPE?: string;
  PRDLST_CD_NM?: string;
  FRMLCUNIT?: string;
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

function mapCategory(prdlstType: string | undefined): "food" | "health_functional" {
  return prdlstType?.includes("건강기능식품") ? "health_functional" : "food";
}

function firstImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

function parseRow(raw: RawRow): CollectedRow | null {
  if (!raw.RTRVLDSUSE_SEQ) return null; // 고유키 생성 실패 -> 건너뜀

  const productName = raw.PRDTNM?.trim();
  const companyName = raw.BSSHNM?.trim();
  const gradeNormalized = normalizeRecallGrade(raw.RTRVL_GRDCD_NM);
  const { score, level } = calcRecallRisk(gradeNormalized);

  const qualityOk = Boolean(productName && companyName);

  return {
    source_key: `${SERVICE_ID}:${raw.RTRVLDSUSE_SEQ}`,
    category: mapCategory(raw.PRDLST_TYPE),
    product_name: productName ?? "",
    company_name: companyName ?? "",
    region: extractRegion(raw.ADDR),

    recall_grade_raw: raw.RTRVL_GRDCD_NM ?? null,
    recall_grade_normalized: gradeNormalized,
    recall_reason: raw.RTRVLPRVNS ?? null,
    recall_method: raw.RTRVLPLANDOC_RTRVLMTHD ?? null,
    item_report_no: raw.PRDLST_REPORT_NO || null,
    barcode: raw.BRCDNO || null,
    expiry_date: parseFlexibleDate(raw.DISTBTMLMT),
    manufacture_date: parseFlexibleDate(raw.MNFDT),
    product_image_url: firstImageUrl(raw.IMG_FILE_PATH),
    registered_date: parseDateLoose(raw.CRET_DTM),

    risk_score: score,
    risk_level: level,

    source_type: "api_mfds",
    // 레코드별 딥링크를 제공하는 필드가 API 응답에 없어, 식약처 공개 회수·판매중지
    // 목록 페이지로 연결한다 (이전엔 실수로 개발자용 API 문서 페이지를 넣었었음).
    source_url:
      "https://www.foodsafetykorea.go.kr/portal/fooddanger/suspension.do?menu_no=2713&menu_grp=MENU_NEW02",
    sanitized_raw_data: {
      // allowlist만 — TELNO(전화번호), ADDR 원문, LCNS_NO(인허가번호 원문)는 절대 포함하지 않는다.
      // recalls 테이블에는 인허가번호 컬럼 자체가 없어 마스킹 저장도 하지 않는다.
      RTRVLDSUSE_SEQ: raw.RTRVLDSUSE_SEQ,
      PRDTNM: raw.PRDTNM,
      BSSHNM: raw.BSSHNM,
      RTRVL_GRDCD_NM: raw.RTRVL_GRDCD_NM,
      RTRVLPRVNS: raw.RTRVLPRVNS,
      RTRVLPLANDOC_RTRVLMTHD: raw.RTRVLPLANDOC_RTRVLMTHD,
      PRDLST_TYPE: raw.PRDLST_TYPE,
      PRDLST_CD_NM: raw.PRDLST_CD_NM,
      FRMLCUNIT: raw.FRMLCUNIT,
      DISTBTMLMT: raw.DISTBTMLMT,
      MNFDT: raw.MNFDT,
    },

    status: qualityOk ? "published" : "quarantined",
  };
}

export function createFoodRecallsCollector(apiKey: string): Collector {
  return {
    sourceName: "recall_food",
    table: "recalls",
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
