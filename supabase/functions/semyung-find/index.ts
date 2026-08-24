// 북스타 — 세명대 통합검색 브리지(종이책 단행본 + 학위논문 등) — semyung_tulip 판 (P3)
// 구버전: 스크래핑 semyung_catalog(8.5만) 임베딩 → match_catalog 의미검색.
// 신버전: 공식 API 수집 semyung_tulip(32만 전수) 하이브리드 —
//   ① search_tulip RPC: 토큰 AND(정규화 trigram 인덱스) + word_similarity 랭킹 (정확 서지 매칭)
//   ② 부족분은 match_tulip(kind=paper) 의미검색으로 보강 (전 장서 임베딩, 하한 0.45 = 구버전과 동일)
// 입력: { query: string, count?: number, material?: 'book'|'thesis'|null, floor?: number, prefer?: 'ebook', mode?: 'semantic' }
// 응답: { candidates:[{ key, title, author, publisher, material, typecode, detailUrl, cover, description, similarity, fuzzy? }], count }
// mode='semantic' (8/24 앱 자연어 검색): 어휘 매칭 생략, 전자책 의미검색만 — 앱이 재고 걸러 10권 노출.
//   임베딩 실패 시엔 어휘 검색으로 폴백(빈손 방지).
// 기본 모드에 닮은꼴 폴백 추가(8/24): 어휘 매칭 0건이면 search_norm ilike 창(앞·뒤·중간 3자)으로 후보를 모아
//   바이그램 Dice 점수로 오타를 잡는다 — "채식주이자"→채식주의자. DDL 없이 함수 안에서만 처리.
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
      key: b.brcd, ctrl: b.ctrl, title: b.title, author: b.author || "", publisher: b.publisher || "",
      material: "book", typecode: "", detail_url: b.detail_url || "",
      cover: b.cover || "", description: b.description || "", similarity: b.similarity,
    }));
  } catch { return []; }
}

// ── 닮은꼴 검색 (오타 폴백, DDL 없이) ──
// 점수 = 제목(정규화) 안에서 검색어 길이만 한 창을 밀며 잰 최소 편집거리 → 1 - 거리/길이.
// "채식주이자"(5자)와 "채식주의자 : 한강 장편소설" → 창 '채식주의자'에서 1글자 차이 → 0.8.
// (바이그램 겹침 방식은 짧은 한글 오타에서 0.5 언저리로 뭉개져 폐기 — 8/24 실측)
const normQ = (s: string) => String(s || "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
function editDist(a: string, b: string) {
  const n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const t = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return dp[n];
}
function localSim(nq: string, text: string) {
  if (!text) return 0;
  if (text.includes(nq)) return 1;
  const L = nq.length;
  let best = Infinity;
  for (const w of [L - 1, L, L + 1]) {
    if (w < 2) continue;
    if (text.length <= w) { best = Math.min(best, editDist(nq, text)); continue; }
    for (let i = 0; i + w <= text.length; i++) best = Math.min(best, editDist(nq, text.slice(i, i + w)));
  }
  return best === Infinity ? 0 : Math.max(0, 1 - best / L);
}
async function fuzzyTulip(q: string, count: number) {
  const nq = normQ(q);
  if (nq.length < 3 || nq.length > 30) return [];
  // 검색어의 앞·뒤·중간 3자 창으로 후보를 긁는다(gin_trgm이 ilike를 받쳐줌) — 오타가 어디에 있어도 한 창은 살아남는다
  const wins = new Set<string>([nq.slice(0, 3), nq.slice(-3)]);
  if (nq.length >= 6) { const m = Math.floor(nq.length / 2); wins.add(nq.slice(m - 1, m + 2)); }
  const seen = new Map<string, any>();
  await Promise.all([...wins].map(async (w) => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/semyung_tulip?select=ctrl,title,author,publisher,kind,cover_url&search_norm=ilike.${encodeURIComponent("*" + w + "*")}&limit=60`,
        { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
      if (!r.ok) return;
      const rows = await r.json();
      if (Array.isArray(rows)) rows.forEach((x: any) => { if (x.ctrl && !seen.has(x.ctrl)) seen.set(x.ctrl, x); });
    } catch { /* 창 하나 실패는 무시 */ }
  }));
  // 동점이면 제목 '앞부분'이 검색어와 닮은 책 먼저 — "채식주이자"에서 「채식주의자」가 「무민은 채식주의자」보다 위로
  return [...seen.values()].map((x) => {
    const tn = normQ(x.title);
    return { x, sim: localSim(nq, tn), pre: localSim(nq, tn.slice(0, nq.length + 1)) };
  }).filter((s) => s.sim >= 0.65).sort((a, b) => (b.sim - a.sim) || (b.pre - a.pre)).slice(0, count)
    .map(({ x, sim }) => ({
      key: String(x.ctrl), title: x.title, author: x.author || "", publisher: x.publisher || "",
      material: "book", typecode: "", detail_url: "", cover: x.cover_url || "",
      description: "", similarity: sim, fuzzy: true,
    }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { query, count, material, floor, prefer, mode } = await req.json().catch(() => ({}));
    if (!query || !String(query).trim()) return json({ candidates: [], count: 0 });
    const want = Math.min(Number(count) || 12, 40);
    // 자연어 모드(앱 8/24) — 어휘 매칭 건너뛰고 전자책 의미검색만. 앱이 재고를 걸러 '바로 빌릴 수 있는 책'만 보여준다
    if (mode === "semantic") {
      const emb = await embedQuery(String(query));
      let rows: any[] = [];
      if (emb) {
        // 자연어는 0.45가 너무 짜서 4~7건에 그친다(8/24 실측) — 0.35로 넉넉히 뽑고 앱이 재고 걸러 10권만 노출
        const floorVal = typeof floor === "number" ? floor : 0.35;
        rows = (await matchKind(emb, want * 2, floorVal, "ebook")).slice(0, want);
      }
      if (!rows.length) rows = await searchTulip(String(query), want, null);   // 임베딩 죽어도 빈손은 안 준다
      // ctrl 없는 행은 바코드로 서버에서 되찾는다(8/24) — match_tulip이 ctrl을 안 줄 때
      //   비정형 바코드(13자리 숫자 아님)를 앱이 끝 12자 ctrl로 오인해 딴 책에 연결되거나 통째로 버려지던 것 방지
      const noCtrl = rows.filter((b: any) => !b.ctrl && b.key);
      if (noCtrl.length) {
        try {
          const bl = noCtrl.map((b: any) => '"' + String(b.key).replace(/"/g, "") + '"').join(",");
          const r2 = await fetch(`${SB_URL}/rest/v1/semyung_tulip?select=ctrl,barcode&barcode=in.(${encodeURIComponent(bl)})&limit=${noCtrl.length}`,
            { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
          if (r2.ok) {
            const m2 = Object.fromEntries((await r2.json()).map((x: any) => [String(x.barcode), String(x.ctrl)]));
            rows.forEach((b: any) => { if (!b.ctrl && m2[String(b.key)]) b.ctrl = m2[String(b.key)]; });
          }
        } catch { /* 되찾기 실패면 기존 그대로 */ }
      }
      // key는 ctrl 우선(8/24) — 앱은 이 key로 상세(대출 버튼)를 연다
      const candidates = rows.map((b: any) => ({
        key: String(b.ctrl || b.key || ""), title: b.title, author: b.author || "", publisher: b.publisher || "",
        material: b.material, typecode: b.typecode || "", detailUrl: b.detail_url || "",
        cover: b.cover || "", description: b.description || "", similarity: b.similarity,
      }));
      return json({ candidates, count: candidates.length, mode: "semantic" });
    }
    let rows = await searchTulip(String(query), want,
      material === "book" || material === "thesis" ? material : null);
    // 닮은꼴(오타) 폴백 — 0건일 때만이 아니라, 검색어를 통째로 품은 제목이 하나도 없으면 병행한다.
    // ("채식주이자"는 어휘검색이 '채식 이야기' 같은 딴 책 10건을 채워버려 0건 조건으로는 영영 안 돌았다 — 8/24 실측)
    // 찾으면 fuzzy 표시를 달아 맨 앞에 — 앱이 "혹시 이 책?"으로 보여준다
    const nqAll = normQ(String(query));
    if (nqAll.length >= 3 && !rows.some((r: any) => normQ(r.title).includes(nqAll))) {
      const fz = await fuzzyTulip(String(query), Math.min(want, 12));
      if (fz.length) {
        const fzKeys = new Set(fz.map((f: any) => f.key));
        rows = [...fz, ...rows.filter((r: any) => !fzKeys.has(String(r.key || "").slice(-12)))].slice(0, want);
      }
    }
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
      similarity: b.similarity, fuzzy: b.fuzzy || undefined,
    }));
    return json({ candidates, count: candidates.length });
  } catch (e) {
    return json({ candidates: [], count: 0, error: String(e) }, 200);
  }
});
