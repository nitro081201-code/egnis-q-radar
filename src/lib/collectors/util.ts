import { createHash } from "node:crypto";

/** "YYYYMMDD" -> "YYYY-MM-DD", 파싱 실패 시 null (자동 공개 금지 원칙 §7) */
export function parseYyyymmdd(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${y}-${mo}-${d}`;
}

/**
 * "YYYYMMDD" 또는 "YYYY-MM-DD HH:MM:SS.s" 둘 다 허용 (I2630 PUBLIC_DT는 후자 형식으로
 * 옴 — 문서상 파라미터 표는 YYYYMMDD라 했지만 실제 응답은 타임스탬프임, 실 데이터로 확인함)
 */
export function parseDateLoose(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, mo, d] = isoMatch;
    const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return `${y}-${mo}-${d}`;
  }
  return parseYyyymmdd(trimmed);
}

/** VILTCN 형식: "(YYYYMMDD)위반내용텍스트" — 실 데이터로 확인된 패턴 */
export function parseViltcn(raw: string | undefined | null): {
  date: string | null;
  content: string | null;
} {
  if (!raw) return { date: null, content: null };
  const m = raw.match(/^\((\d{8})\)([\s\S]*)$/);
  if (!m) return { date: null, content: raw };
  return { date: parseYyyymmdd(m[1]), content: m[2].trim() || null };
}

/**
 * 회수 API(I0490)의 DISTBTMLMT/MNFDT는 형식이 들쭉날쭉하다 (실 데이터로 확인):
 * "2027-07-05", "2029.1.30", "제조일로부터 9개월"(날짜 아님), "데이터없음"(값 없음).
 * 실제 날짜로 확인되는 것만 파싱하고, 나머지는 null로 둔다(추측 계산 금지).
 */
export function parseFlexibleDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const dash = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const dot = trimmed.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  const m = dash ?? dot;
  if (!m) return null;
  const [, y, mo, d] = m;
  const mm = mo.padStart(2, "0");
  const dd = d.padStart(2, "0");
  const date = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return `${y}-${mm}-${dd}`;
}

const RECALL_GRADE_VALUES = ["1등급", "2등급", "3등급", "미분류"] as const;
export type RecallGradeNormalized = (typeof RECALL_GRADE_VALUES)[number];

export function normalizeRecallGrade(raw: string | undefined | null): RecallGradeNormalized {
  if (!raw) return "미분류";
  const found = RECALL_GRADE_VALUES.find((v) => raw.includes(v));
  return found ?? "미분류";
}

/** §5 위험도 점수 공식 (회수) */
export function calcRecallRisk(
  grade: RecallGradeNormalized
): { score: number; level: "critical" | "high" | "medium" | "low" } {
  const score = { "1등급": 95, "2등급": 70, "3등급": 50, "미분류": 40 }[grade];
  const level = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low";
  return { score, level };
}

const SIDO_MAP: Record<string, string> = {
  "서울특별시": "서울",
  "부산광역시": "부산",
  "대구광역시": "대구",
  "인천광역시": "인천",
  "광주광역시": "광주",
  "대전광역시": "대전",
  "울산광역시": "울산",
  "세종특별자치시": "세종",
  "경기도": "경기",
  "강원도": "강원",
  "강원특별자치도": "강원",
  "충청북도": "충북",
  "충청남도": "충남",
  "전라북도": "전북",
  "전북특별자치도": "전북",
  "전라남도": "전남",
  "경상북도": "경북",
  "경상남도": "경남",
  "제주특별자치도": "제주",
};

/** 전체 주소에서 시/도 단위만 추출 (개인정보 최소화 §1) */
export function extractRegion(addr: string | undefined | null): string | null {
  if (!addr) return null;
  const first = addr.trim().split(/\s+/)[0];
  return SIDO_MAP[first] ?? null;
}

/** 인허가번호 원문은 저장하지 않는다 — 마스킹 값과 단방향 해시만 반환 (§privacy) */
export function maskAndHashLicenseNo(raw: string | undefined | null): {
  masked: string | null;
  hash: string | null;
} {
  if (!raw) return { masked: null, hash: null };
  const trimmed = raw.trim();
  const hash = createHash("sha256").update(trimmed).digest("hex");
  const masked =
    trimmed.length > 4
      ? `${trimmed.slice(0, -4)}${"*".repeat(4)}`
      : "*".repeat(trimmed.length);
  return { masked, hash };
}

const DISPOSITION_TYPE_VALUES = [
  "시정명령",
  "영업정지",
  "품목제조정지",
  "과징금",
  "영업소폐쇄",
  "등록취소",
  "공표",
  "회수폐기",
  "기타",
] as const;
export type DispositionTypeNormalized = (typeof DISPOSITION_TYPE_VALUES)[number];

/** 원문 처분유형 텍스트를 DB check 제약에 맞는 값으로 정규화 */
export function normalizeDispositionType(raw: string | undefined | null): DispositionTypeNormalized {
  if (!raw) return "기타";
  const found = DISPOSITION_TYPE_VALUES.find((v) => raw.includes(v));
  return found ?? "기타";
}

/** §5 위험도 점수 공식 (행정처분) */
export function calcDispositionRisk(
  dispositionType: DispositionTypeNormalized,
  violationContent: string | null
): { score: number; level: "critical" | "high" | "medium" | "low" } {
  const base: Record<DispositionTypeNormalized, number> = {
    영업소폐쇄: 90,
    등록취소: 90,
    영업정지: 70,
    품목제조정지: 60,
    과징금: 50,
    공표: 45,
    회수폐기: 45,
    시정명령: 30,
    기타: 20,
  };

  let score = base[dispositionType];
  const content = violationContent ?? "";
  if (/미생물|이물|위해|중금속|잔류농약/.test(content)) score += 10;
  if (/질병|치료|예방|허위|과대/.test(content)) score += 5;
  score = Math.min(score, 100);

  const level = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : "low";
  return { score, level };
}
