// 북스타 — ISBN → 서지 보강 (알라딘 별점·쪽수·소개·발행년 + 정보나루 대출·표지)
// 입력: { isbns: ["9788...", ...] }
// 출력: { info: { isbn: { cover, rating, ratingCount, pages, description, pubYear, publisher, loan } } }
const KEY = Deno.env.get("DATA4LIB_KEY")!;          // 정보나루
const ALADIN = "ttbbgtrfvcdewsx771056001";          // 알라딘 TTBKey (공개 OpenAPI 키)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const https = (u: string) => (u || "").trim().replace(/^http:/, "https:");
const strip = (s: string) =>
  (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim().slice(0, 500);
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
  return m ? m[1].trim() : "";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { isbns } = await req.json();
    const list = [...new Set((isbns || []).filter(Boolean))].slice(0, 24) as string[];
    const info: Record<string, Record<string, unknown>> = {};

    await Promise.all(list.map(async (isbn) => {
      const o: Record<string, unknown> = {};
      // ── 알라딘: 별점·쪽수·소개·발행년·출판사·표지 ──
      try {
        const ar = await fetch(
          `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN}&itemIdType=ISBN13&ItemId=${encodeURIComponent(isbn)}&output=js&Version=20131101&OptResult=ratingInfo`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        const txt = (await ar.text()).trim().replace(/;\s*$/, "");
        const j = JSON.parse(txt);
        const it = j.item && j.item[0];
        if (it) {
          if (it.title) o.title = it.title;
          if (it.author) o.author = it.author;
          if (it.cover) o.cover = https(it.cover);
          if (it.description) o.description = strip(it.description);
          if (it.publisher) o.publisher = it.publisher;
          if (it.pubDate) { const y = (it.pubDate.match(/\d{4}/) || [])[0]; if (y) o.pubYear = y; }
          const si = it.subInfo || {};
          if (si.itemPage) o.pages = si.itemPage;
          const ri = si.ratingInfo || {};
          if (ri.ratingScore != null && ri.ratingScore > 0) {
            o.rating = Math.round((ri.ratingScore / 2) * 10) / 10; // 10점 → 5점 환산
            o.ratingCount = ri.ratingCount || 0;
          }
        }
      } catch (_) { /* 알라딘 실패 시 정보나루로 보강 */ }
      // ── 정보나루: 대출수(+표지·소개 폴백) ──
      try {
        const dr = await fetch(
          `http://data4library.kr/api/usageAnalysisList?authKey=${KEY}&isbn13=${encodeURIComponent(isbn)}`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        const xml = await dr.text();
        const ln = tag(xml, "loanCnt"); if (ln && /^\d+$/.test(ln)) o.loan = parseInt(ln, 10);
        if (!o.title) { const t = tag(xml, "bookname"); if (t) o.title = t; }
        if (!o.author) { const a = tag(xml, "authors"); if (a) o.author = a; }
        if (!o.cover) { const c = tag(xml, "bookImageURL"); if (c) o.cover = https(c); }
        if (!o.description) { const d = tag(xml, "description"); if (d) o.description = strip(d); }
        if (!o.publisher) { const p = tag(xml, "publisher"); if (p) o.publisher = p; }
        if (!o.pubYear) { const y = tag(xml, "publication_year"); if (y) o.pubYear = y; }
      } catch (_) { /* skip */ }

      if (Object.keys(o).length) info[isbn] = o;
    }));

    return json({ info });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
