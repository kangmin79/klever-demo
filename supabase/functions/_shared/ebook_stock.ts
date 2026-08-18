// 세명대 구매 전자책 재고(대출가능 여부) — 상세페이지 스크래핑(로그인 불필요) + 짧은 캐시 + 병렬 조회.
//   semyung-ebook-borrow의 fetchStock과 동일 로직(추천 엔진에서 여러 권을 한 번에 봐야 해서 공용화, 2026-08-18).
//   ⚠️ 정식 API가 아니라 화면 파싱 — 못 읽으면 null(=모름). 호출측은 null을 "미확인"으로 다루고 절대 "대출 중"으로 단정하지 말 것.
import { EB, LBRY } from "./semyung_session.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export type Stock = { loaned: number; total: number; reserved: number; available: boolean; reservable: boolean; btn: string };

// 인스턴스 메모리 캐시(3분) — 같은 인기책이 여러 질의에서 반복 조회되는 걸 줄인다. 도서관 재고는 분 단위로만 바뀐다.
const CACHE = new Map<string, { at: number; v: Stock | null }>();
const TTL_MS = 3 * 60 * 1000;

export async function fetchStock(brcd: string, timeoutMs = 4000): Promise<Stock | null> {
  const key = String(brcd || "").replace(/[^0-9A-Za-z]/g, "");
  if (!key) return null;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let v: Stock | null = null;
  try {
    const r = await fetch(`${EB}/content/contentView.ink?lbryCode=${LBRY}&brcd=${key}`, { headers: { "User-Agent": UA }, signal: ctl.signal });
    if (r.ok) {
      const html = await r.text();
      const m = /대출\s*:\s*(\d+)\s*\/\s*(\d+)[\s\S]{0,120}?예약\s*:\s*(\d+)/.exec(html.replace(/<[^>]+>/g, " "));
      if (m) {
        const loaned = +m[1], total = +m[2], reserved = +m[3];
        const btn = (/name="(?:brwBtn|reveBtn)"[^>]*value="([^"]*)"/.exec(html) || [, ""])[1].trim();
        v = { loaned, total, reserved, available: btn ? btn.includes("대출") : loaned < total, reservable: btn === "예약", btn };
      }
    }
  } catch (_) { v = null; }
  finally { clearTimeout(timer); }
  // 실패(null)는 짧게만 캐시(30초) — 일시 장애가 3분 동안 "모름"으로 굳지 않게
  CACHE.set(key, { at: v ? Date.now() : Date.now() - TTL_MS + 30_000, v });
  return v;
}

// 여러 권 병렬 조회 → Map<brcd, Stock|null>. 동시성 상한(도서관 서버 배려)·전체 타임아웃.
export async function stockMany(brcds: string[], opts: { concurrency?: number; timeoutMs?: number } = {}): Promise<Map<string, Stock | null>> {
  const conc = Math.max(1, opts.concurrency ?? 8);
  const to = opts.timeoutMs ?? 4000;
  const uniq = [...new Set(brcds.map((b) => String(b || "").replace(/[^0-9A-Za-z]/g, "")).filter(Boolean))];
  const out = new Map<string, Stock | null>();
  let i = 0;
  const worker = async () => {
    while (i < uniq.length) {
      const b = uniq[i++];
      out.set(b, await fetchStock(b, to));
    }
  };
  await Promise.all(Array.from({ length: Math.min(conc, uniq.length) }, worker));
  return out;
}
