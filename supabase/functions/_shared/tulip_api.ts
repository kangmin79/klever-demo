// 북스타 — 퓨처누리 TulipWeb2 openapi 호출·XML 파싱 공용 모듈
// (semyung-my 프록시와 알림 배치가 같은 파서를 쓰도록 한 곳에 둔다)
export const TULIP = "https://lib.semyung.ac.kr/openapi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ── 범용 XML→JSON (규격서에 없는 필드도 그대로 살림 — 실전 구조 미확정 대비) ──
const unCdata = (s: string) => {
  const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s.trim());
  return (m ? m[1] : s).trim();
};
// deno-lint-ignore no-explicit-any
export function xmlToObj(xml: string): any {
  const src = xml.replace(/<\?xml[\s\S]*?\?>/, "").trim();
  const tagRe = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<([A-Za-z_][\w.-]*)(?:\s[^>]*)?\/>/g;
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = {};
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = tagRe.exec(src))) {
    any = true;
    const name = m[1] || m[3];
    const inner = m[2] ?? "";
    const val = /<[A-Za-z_][\w.-]*(\s[^>]*)?\/?>/.test(inner) ? xmlToObj(inner) : unCdata(inner);
    if (name in out) {
      if (!Array.isArray(out[name])) out[name] = [out[name]];
      out[name].push(val);
    } else out[name] = val;
  }
  return any ? out : unCdata(src);
}

// deno-lint-ignore no-explicit-any
export async function tulip(path: string, params: Record<string, string>): Promise<{ raw: string; data: any }> {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${TULIP}/${path}?${qs}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });   // 8/29 타임아웃
  const raw = new TextDecoder("utf-8").decode(await r.arrayBuffer());
  // 8/24 리뷰: HTTP 상태를 안 보고 에러 페이지(500 등)도 그대로 파싱했다 — 쓰기류가 거짓 성공이 되는 한 축.
  //   실패는 실패라고 던진다(호출부가 전부 try/catch로 감싸고 있음).
  if (!r.ok) throw new Error(`도서관 서버 오류(${r.status})`);
  return { raw, data: xmlToObj(raw) };
}

/** err 코드(011=verb 미인식 등) 판독 — 응답에 err/error 있으면 실패 */
// deno-lint-ignore no-explicit-any
export function tulipErr(data: any): string {
  const e = data?.result?.err ?? data?.result?.error ?? data?.err ?? data?.error;
  return e ? String(e) : "";
}

/** 도서관 XML은 결과가 1건이면 배열이 아니라 객체로 온다 — 항상 배열로 편다 */
// deno-lint-ignore no-explicit-any
export function items(data: any): any[] {
  const it = data?.item;
  if (!it) return [];
  return Array.isArray(it) ? it : [it];
}
