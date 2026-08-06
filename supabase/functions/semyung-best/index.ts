// 북스타 — 세명대 전자도서관 자료 프록시 (CORS 우회 + 파싱)
// ?kind=best (기본) → main/bestContent.json?bestCttsDvsnCode=1 (구매 전자책 대출 베스트, top→list 순서로 1..N)
// ?kind=new          → main/newContent.json (신착 자료, 발행일 포함)
// 출력: { books:[{ rank, brcd, title, author, publisher, cover, detail, pubDate }], fetchedAt }
const HOST = "https://ebook.semyung.ac.kr";
const SRC = {
  best: HOST + "/elibrary-front/main/bestContent.json?bestCttsDvsnCode=1",
  new: HOST + "/elibrary-front/main/newContent.json",
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const unesc = (s: string) =>
  (s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

function coverUrl(c: string): string {
  c = (c || "").trim();
  if (!c) return "";
  if (c.startsWith("//")) return "https:" + c;
  if (c.startsWith("/")) return HOST + c;
  if (c.startsWith("http://")) return c.replace(/^http:/, "https:");
  return c;
}
const detailUrl = (brcd: string) =>
  `${HOST}/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd=${brcd}`;

function mapRow(x: any, i: number) {
  return {
    rank: i + 1,
    brcd: String(x.brcd),
    title: unesc(String(x.cttsHnglName || "")),
    author: unesc(String(x.sntnAuthName || x.autrIntcCntt || "")),
    publisher: unesc(String(x.pbcmName || x.pubcName || "")),
    cover: coverUrl(x.coverImage),
    detail: detailUrl(String(x.brcd)),
    pubDate: String(x.publDate || ""),
  };
}

// kind별 메모리 캐시 (콜드스타트당, 30분 TTL)
const CACHE: Record<string, { data: unknown; ts: number }> = {};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") === "new" ? "new" : "best";
    const c = CACHE[kind];
    if (c && Date.now() - c.ts < 1_800_000) return json(c.data);

    const r = await fetch(SRC[kind], {
      headers: { "User-Agent": UA, "Referer": HOST + "/elibrary-front/main.ink", "X-Requested-With": "XMLHttpRequest" },
    });
    if (!r.ok) return json({ error: "upstream " + r.status, books: [] }, 200);
    const d = await r.json();

    let ordered: any[];
    if (kind === "new") {
      ordered = (Array.isArray(d.mainNewList) ? d.mainNewList : []).filter((x: any) => x && x.cttsHnglName && x.brcd);
    } else {
      const top = Array.isArray(d.mainBestListTop) ? d.mainBestListTop : [];
      const list = Array.isArray(d.mainBestList) ? d.mainBestList : [];
      ordered = [...top, ...list].filter((x: any) => x && x.cttsHnglName && x.brcd);
    }
    const books = ordered.slice(0, 20).map(mapRow);
    const out = { books, fetchedAt: new Date().toISOString() };
    if (books.length) CACHE[kind] = { data: out, ts: Date.now() };
    return json(out);
  } catch (e) {
    return json({ error: String(e), books: [] }, 200);
  }
});
