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
