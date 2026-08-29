// 전자책 재고 — "표에서 읽기" (2026-08-29, 웹 긁기 0 설계)
//
// 왜 이 파일이 생겼나
//   별이 검색·닮은책 추천·책 상세 배지가 학생이 누를 때마다 학교 전자도서관 화면을 실시간으로 긁고 있었다
//   (검색 1회당 최대 10권, 닮은책 최대 24권). 그런데 같은 프로젝트에 이미 재고를 쌓아 두는 표(solsup_stock)가
//   있었고 — 8/19 솔숲 앱이 만든 것 — 웹은 그 표를 한 번도 안 보고 있었다(웹 쪽이 하루 먼저 만들어져 갱신이 안 됨).
//   → 웹은 이 표만 읽는다. 학교 서버는 표를 채우는 밤 작업 한 번만 부른다. 학생이 검색을 얼마나 하든 학교 호출은 늘지 않는다.
//
// 원칙
//   - 여기서는 학교 서버를 절대 부르지 않는다. 표에 없거나 너무 오래된 값은 null(=모름)로 준다.
//   - null 은 "대출 중"이 아니다. 호출측은 반드시 "미확인"으로 다루고, 그 책을 숨기거나 대출 중으로 단정하지 말 것.
//   - 오래된 기준(maxAgeMs)은 호출측이 정한다. 기본 36시간 = 밤 작업 1회 + 여유.
//
// 표(solsup_stock) 열: brcd·ctrl·title·loaned·total·reserved·available·checked_at (solsup-stock 함수가 채움)
import type { Stock } from "./ebook_stock.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRV = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const DEFAULT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

export type TableStock = Stock & { checked_at: string; age_ms: number };

export type TableStockResult = {
  map: Map<string, TableStock | null>;   // brcd → 재고(신선) | null(없음·오래됨·읽기실패)
  found: number;      // 표에 있던 수
  fresh: number;      // 그중 maxAge 이내
  stale: number;      // 표엔 있으나 오래된 수
  missing: number;    // 표에 아예 없는 수
  error: string | null;   // 표 읽기 자체가 실패했으면 사유(호출측은 전부 null로 받는다)
};

/** 여러 권의 재고를 표에서 한 번에 읽는다. 학교 서버 호출 0. */
export async function stockFromTable(brcds: string[], opts: { maxAgeMs?: number } = {}): Promise<TableStockResult> {
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const uniq = [...new Set(brcds.map((b) => String(b || "").replace(/[^0-9A-Za-z]/g, "")).filter(Boolean))];
  const map = new Map<string, TableStock | null>();
  for (const b of uniq) map.set(b, null);
  const res: TableStockResult = { map, found: 0, fresh: 0, stale: 0, missing: uniq.length, error: null };
  if (!uniq.length) return res;
  try {
    const inList = uniq.map((b) => `"${b}"`).join(",");
    const r = await fetch(
      `${SB_URL}/rest/v1/solsup_stock?select=brcd,loaned,total,reserved,available,checked_at&brcd=in.(${inList})`,
      { headers: { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}` } },
    );
    if (!r.ok) { res.error = `solsup_stock ${r.status}`; return res; }
    const rows: any[] = await r.json();
    const now = Date.now();
    for (const row of Array.isArray(rows) ? rows : []) {
      const key = String(row.brcd || "");
      if (!map.has(key)) continue;
      res.found++;
      const at = row.checked_at ? new Date(row.checked_at).getTime() : NaN;
      const age = Number.isFinite(at) ? now - at : Number.POSITIVE_INFINITY;
      // available 이 null 이면 그때 못 읽은 것 → 모름
      if (age > maxAge || row.available == null) { res.stale++; continue; }
      const loaned = Number(row.loaned ?? 0), total = Number(row.total ?? 0), reserved = Number(row.reserved ?? 0);
      map.set(key, {
        loaned, total, reserved,
        available: row.available === true,
        reservable: row.available !== true,
        btn: row.available === true ? "대출" : "예약",
        checked_at: String(row.checked_at), age_ms: age,
      });
      res.fresh++;
    }
    res.missing = uniq.length - res.found;
  } catch (e) {
    res.error = String((e as Error)?.message || e);
  }
  return res;
}

/** 한 권 — 상세 배지용. 없거나 오래됐으면 null. */
export async function stockOneFromTable(brcd: string, opts: { maxAgeMs?: number } = {}): Promise<TableStock | null> {
  const r = await stockFromTable([brcd], opts);
  return r.map.get(String(brcd || "").replace(/[^0-9A-Za-z]/g, "")) ?? null;
}
