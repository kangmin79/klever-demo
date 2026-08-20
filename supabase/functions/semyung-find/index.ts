// 북스타 — 세명대 통합검색 브리지(종이책 단행본 + 학위논문 등) — semyung_tulip 판 (P3)
// 구버전: 스크래핑 semyung_catalog(8.5만) 임베딩 → match_catalog 의미검색.
// 신버전: 공식 API 수집 semyung_tulip(32만 전수) 하이브리드 —
//   ① search_tulip RPC: 토큰 AND(정규화 trigram 인덱스) + word_similarity 랭킹 (정확 서지 매칭)
//   ② 부족분은 match_tulip(kind=paper) 의미검색으로 보강 (전 장서 임베딩, 하한 0.45 = 구버전과 동일)
// 입력: { query: string, count?: number, material?: 'book'|'thesis'|null, floor?: number }
// 응답: { candidates:[{ key, title, author, publisher, material, typecode, detailUrl, cover, description, similarity }], count }
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";
const SIM_FLOOR = 0.45;   // 서지 임베딩 노이즈 컷 (구버전 6/28 실측 근거 유지)

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

async function embedQuery(text: string): Promise<number[] | null> {
  if (!OPENAI || !text.trim()) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST", headers: { Authorization: "Bearer " + OPENAI, "content-type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!r.ok) return null;
    return (await r.json()).data?.[0]?.embedding ?? null;
  } catch { return null; }
}

// 의미검색 보강: match_tulip — 판형별 부분 인덱스(kind='paper'|'ebook'). 실패·빈결과는 조용히 [] (lexical 결과만으로 응답)
async function matchKind(emb: number[], count: number, floor: number, kind: string) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/match_tulip`, {
      method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" },
      body: JSON.stringify({ query_embedding: emb, match_count: count, kind_filter: kind }),
    });
    if (!r.ok) return [];
    const rows = await r.json();
    if (!Array.isArray(rows)) return [];
    return rows.filter((x: any) => (x.similarity ?? 0) >= floor).map((b: any) => ({
      key: b.brcd, title: b.title, author: b.author || "", publisher: b.publisher || "",
      material: "book", typecode: "", detail_url: b.detail_url || "",
      cover: b.cover || "", description: b.description || "", similarity: b.similarity,
    }));
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { query, count, material, floor, prefer } = await req.json().catch(() => ({}));
    if (!query || !String(query).trim()) return json({ candidates: [], count: 0 });
    const want = Math.min(Number(count) || 12, 40);
    const rows = await searchTulip(String(query), want,
      material === "book" || material === "thesis" ? material : null);
    // 정확 매칭이 모자라면 의미검색으로 보강 (thesis 필터 시엔 정확 매칭만 — 의미보강은 book 전용)
    // prefer='ebook'이면 전자책 이웃을 먼저 채우고 남은 자리를 종이책으로 (기본은 기존 그대로 종이책만)
    if (rows.length < want && material !== "thesis") {
      const emb = await embedQuery(String(query));
      if (emb) {
        const floorVal = typeof floor === "number" ? floor : SIM_FLOOR;
        const kinds = prefer === "ebook" ? ["ebook", "paper"] : ["paper"];
        const lists = await Promise.all(kinds.map((k) => matchKind(emb, want * 2, floorVal, k)));
        const seen = new Set(rows.map((r: any) => r.key));
        outer: for (const list of lists) {
          for (const m of list) {
            if (seen.has(m.key)) continue;
            seen.add(m.key); rows.push(m);
            if (rows.length >= want) break outer;
          }
        }
      }
    }
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
