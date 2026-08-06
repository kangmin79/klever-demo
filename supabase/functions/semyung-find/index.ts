// 북스타 — 세명대 통합검색 브리지(종이책 단행본 + 학위논문 등) — semyung_tulip 판 (P3)
// 구버전: 스크래핑 semyung_catalog 임베딩 → match_catalog 의미검색.
// 신버전: 공식 API 수집 semyung_tulip(32만 전수)의 search_tulip RPC — 토큰 AND(정규화 trigram 인덱스) + word_similarity 랭킹.
//   임베딩 제거 이유: 종이책 32만 임베딩은 스토리지 2GB 초과 위험, 서지(제목+저자)만의 임베딩은 표면어 노이즈가 커
//   실익이 적었음(구버전 SIM_FLOOR 0.45 컷이 그 증거). 의미 recall은 별이 체인의 curate(전자책 벡터)가 담당.
// 입력: { query: string, count?: number, material?: 'book'|'thesis'|null }  (floor는 구버전 호환용 — 무시)
// 응답: { candidates:[{ key, title, author, publisher, material, typecode, detailUrl, cover, description, similarity }], count }
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

async function searchTulip(q: string, count: number, material: string | null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/search_tulip`, {
        method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" },
        body: JSON.stringify({ q, match_count: count, material_filter: material }),
      });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; }
      const rows = await r.json();
      if (Array.isArray(rows)) return rows;
      await new Promise((s) => setTimeout(s, 400 * (attempt + 1)));
    } catch { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); }
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { query, count, material } = await req.json().catch(() => ({}));
    if (!query || !String(query).trim()) return json({ candidates: [], count: 0 });
    const rows = await searchTulip(String(query), Math.min(Number(count) || 12, 40),
      material === "book" || material === "thesis" ? material : null);
    const candidates = rows.map((b: any) => ({
      key: b.key, title: b.title, author: b.author || "", publisher: b.publisher || "",
      material: b.material, typecode: b.typecode || "", detailUrl: b.detail_url || "",
      cover: b.cover || "", description: b.description || "",
      similarity: b.similarity,
    }));
    return json({ candidates, count: candidates.length });
  } catch (e) {
    return json({ candidates: [], count: 0, error: String(e) }, 200);
  }
});
