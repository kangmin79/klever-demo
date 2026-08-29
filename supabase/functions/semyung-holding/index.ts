// 북스타 — 세명대 종이책 소장/대출가능 현황 (TulipWeb2 openapi bookinfo, P3에서 스크래핑 제거)
// ?reckey=CATTOT000000451589 → 소장 권별 [청구기호, 위치(자료실), 상태(대출가능/대출중), 반납예정일]
// 구버전은 OPAC HTML 파싱(쿠키 봇체크) — openapi는 쿠키 불필요·구조 안정.
// 출력: { ok, reckey, total, available, copies:[{callNum, location, status, returnDate,
//         reserveAvailable, mainNo, accessionNo}], fetchedAt }  (앞 4필드는 구버전과 동일 — 앱 호환)
const HOST = "https://lib.semyung.ac.kr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 BookstarSync/1.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// <tag>값</tag> 또는 <tag><![CDATA[값]]></tag> 추출
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
  return m ? m[1].trim() : "";
}

function parseHoldings(xml: string) {
  const copies: any[] = [];
  const re = /<holding>([\s\S]*?)<\/holding>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && copies.length < 20) {
    const h = m[1];
    copies.push({
      callNum: tag(h, "call_no"),
      location: tag(h, "place_name"),
      status: tag(h, "book_state"),
      returnDate: tag(h, "return_date"),
      reserveAvailable: tag(h, "reserve_available") === "Y",
      mainNo: tag(h, "main_no"),
      accessionNo: tag(h, "accession_no"),
    });
  }
  return copies;
}

// reckey별 짧은 캐시 (대출상태 휘발성 → 90초)
const CACHE: Record<string, { data: unknown; ts: number }> = {};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const reckey = (url.searchParams.get("reckey") || "").replace(/[^A-Za-z0-9]/g, "");
    if (!/^CATTOT\d+$/.test(reckey)) return json({ ok: false, error: "bad reckey" }, 400);

    const c = CACHE[reckey];
    if (c && Date.now() - c.ts < 90_000) return json(c.data);

    const ctrl = reckey.replace(/^CATTOT/, "");
    const r = await fetch(`${HOST}/openapi/bookinfo?cid=${encodeURIComponent("CAT" + ctrl)}&verb=holding`, {
      headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return json({ ok: false, error: "upstream " + r.status }, 200);
    const xml = new TextDecoder("utf-8").decode(await r.arrayBuffer());

    const copies = parseHoldings(xml);
    const data = {
      ok: true, reckey,
      total: copies.length,
      available: copies.filter((x) => x.status === "대출가능").length,
      copies,
      fetchedAt: new Date().toISOString(),
    };
    CACHE[reckey] = { data, ts: Date.now() };
    return json(data);
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e) }, 200);
  }
});
