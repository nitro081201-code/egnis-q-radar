import { parse } from "node-html-parser";
import type { CollectedRow, Collector } from "./types";
import { calcDispositionRisk, parseDateLoose } from "./util";
import type { DispositionTypeNormalized } from "./util";

// 화장품 행정처분 — 의약품안전나라(nedrug.mfds.go.kr) 공개 목록 크롤링.
//   목록: GET /pbp/CCBAO01/getList?searchTypeCode=C&page=N&limit=100 (HTML 서버렌더)
//   각 행: 순번 / 업체명(상세링크 dispsApplySeq 포함) / 품목명 / 처분명 / 처분일자 / 공개종료일자
// 식품안전나라 Open API에는 화장품이 없어(§2) 이 페이지가 가장 확실한 원본이다.
// ⚠️ 공식 API가 아닌 HTML 크롤링이라 사이트 개편 시 파서 수정이 필요할 수 있다.
// 고유키(dispsApplySeq)와 레코드별 상세 딥링크가 있어 중복방지·원문연결은 견고하다.

const BASE = "https://nedrug.mfds.go.kr";
const LIST_PATH = "/pbp/CCBAO01/getList";
const ITEM_PATH = "/pbp/CCBAO01/getItem";
const LIMIT = 100;
const MAX_PAGES = 25; // 안전장치 (서버가 limit을 무시하고 10건씩 줘도 250건까지 커버)

interface CosmeticRow {
  seq: string;
  company: string;
  item: string;
  dispsName: string;
  dispsDate: string;
  publicEnd: string;
}

async function fetchListPage(page: number): Promise<string> {
  const url = `${BASE}${LIST_PATH}?searchTypeCode=C&page=${page}&limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: {
      // 일부 정부 사이트는 UA 없는 요청을 차단하므로 명시한다.
      "User-Agent":
        "Mozilla/5.0 (compatible; EGNIS-Q-Radar/1.0; +https://egnis-q-radar.vercel.app)",
      Accept: "text/html",
    },
  });
  if (!res.ok) {
    throw new Error(`화장품 목록 요청 실패: HTTP ${res.status}`);
  }
  return res.text();
}

// 목록 HTML에서 행 데이터를 추출. 모바일용 라벨(span.s-th)을 제거한 뒤 셀 텍스트를 읽는다.
function parseListHtml(html: string): CosmeticRow[] {
  const root = parse(html);
  const rows: CosmeticRow[] = [];
  for (const tr of root.querySelectorAll("tbody tr")) {
    const link = tr.querySelector('a[href*="dispsApplySeq"]');
    const seqMatch = link?.getAttribute("href")?.match(/dispsApplySeq=(\d+)/);
    if (!seqMatch) continue; // 데이터 행이 아님(빈 목록 안내 등)

    const tds = tr.querySelectorAll("td");
    for (const td of tds) {
      for (const label of td.querySelectorAll(".s-th")) label.remove();
    }
    const cell = (i: number) => tds[i]?.text.replace(/\s+/g, " ").trim() ?? "";

    rows.push({
      seq: seqMatch[1],
      company: cell(1),
      item: cell(2),
      dispsName: cell(3),
      dispsDate: cell(4),
      publicEnd: cell(5),
    });
  }
  return rows;
}

// 화장품 처분명(자유 텍스트)을 dispositions.disposition_type check 허용값으로 매핑.
function mapDispositionType(text: string): DispositionTypeNormalized {
  if (/과징금/.test(text)) return "과징금";
  if (/등록취소|허가취소/.test(text)) return "등록취소";
  if (/영업소\s*폐쇄|영업장\s*폐쇄|폐쇄명령/.test(text)) return "영업소폐쇄";
  if (/업무정지|영업정지|판매정지|제조정지/.test(text)) return "영업정지";
  if (/시정명령/.test(text)) return "시정명령";
  if (/공표/.test(text)) return "공표";
  if (/회수|폐기/.test(text)) return "회수폐기";
  return "기타";
}

function toRow(raw: CosmeticRow): CollectedRow | null {
  const company = raw.company.trim();
  const dispsName = raw.dispsName.trim();
  const dispositionDate = parseDateLoose(raw.dispsDate);
  const publicUntil = parseDateLoose(raw.publicEnd);
  if (!company || !dispsName) return null; // 핵심 필드 없으면 스킵

  const dispositionType = mapDispositionType(dispsName);
  // 처분명 텍스트를 위반내용으로 함께 사용해 위험도 키워드 가점(§5)이 반영되게 한다.
  const { score, level } = calcDispositionRisk(dispositionType, dispsName);
  const qualityOk = Boolean(company && dispositionDate);

  return {
    source_key: `CCBAO01:${raw.seq}`,
    category: "cosmetic",
    business_type: null,
    company_name: company,
    region: null, // 목록에 주소가 없음(개인정보 최소화에도 부합)
    license_no_masked: null,
    license_no_hash: null,

    violation_law: null,
    violation_content: dispsName,
    violation_date: null,

    disposition_type_raw: dispsName,
    disposition_type_normalized: dispositionType,
    disposition_detail: dispsName,
    disposition_date: dispositionDate,
    disposition_agency: null,

    risk_score: score,
    risk_level: level,

    source_type: "crawl_mfds",
    // 레코드별 상세 딥링크 — 식품 소스와 달리 원문을 정확히 가리킬 수 있다.
    source_url: `${BASE}${ITEM_PATH}?searchTypeCode=C&dispsApplySeq=${raw.seq}`,
    sanitized_raw_data: {
      // allowlist — 대표자명/전화/주소 등 개인정보는 목록에 없고, 있어도 담지 않는다.
      dispsApplySeq: raw.seq,
      entpName: raw.company,
      itemName: raw.item,
      dispsName: raw.dispsName,
      dispsDate: raw.dispsDate,
      publicEndDate: raw.publicEnd,
    },

    public_until: publicUntil,
    source_updated_at: null,
    last_seen_at: new Date().toISOString(),

    // 식약처 공식 자료 → 바로 노출(사용자 결정). 필수 필드 미비 건만 격리.
    status: qualityOk ? "published" : "quarantined",
    visibility_status: qualityOk ? "visible" : "quarantined",
  };
}

export function createCosmeticDispositionsCollector(): Collector {
  return {
    sourceName: "disposition_cosmetic",
    table: "dispositions",
    async collect() {
      const rows: CollectedRow[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const html = await fetchListPage(page);
        const parsed = parseListHtml(html);
        if (parsed.length === 0) break;
        for (const r of parsed) {
          const row = toRow(r);
          if (row) rows.push(row);
        }
        if (parsed.length < LIMIT) break; // 마지막 페이지
      }
      return rows;
    },
  };
}
