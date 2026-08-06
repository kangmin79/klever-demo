// 북스타 — ISBN → 표지 이미지 보충 (정보나루)
// 입력: { isbns: ["9788...", ...] }  출력: { covers: { isbn: url } }
const KEY = Deno.env.get("DATA4LIB_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { isbns } = await req.json();
    const list = [...new Set((isbns || []).filter(Boolean))].slice(0, 24);
    const covers: Record<string, string> = {};
    await Promise.all(list.map(async (isbn: string) => {
      try {
        const r = await fetch(
          `http://data4library.kr/api/usageAnalysisList?authKey=${KEY}&isbn13=${encodeURIComponent(isbn)}`,
          { headers: { "User-Agent": "Mozilla/5.0" } },
        );
        const xml = await r.text();
        const m = xml.match(/<bookImageURL>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/bookImageURL>/);
        if (m && m[1].trim()) covers[isbn] = m[1].trim().replace(/^http:/, "https:");
      } catch (_) { /* skip */ }
    }));
    return json({ covers });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
