// 북스타 — 별이 통합검색 단일 오케스트레이션 엔진(byeoli-search)
// ───────────────────────────────────────────────────────────────────────────
// 그동안 클라(app.html byeoliFindBooks)에 흩어져 있던 소스 병렬호출+임의병합을
// 백엔드 단일 엔진으로 분리. 화면은 렌더만. 시니어식 설계:
//   ① 소스를 동일 인터페이스(retrieve(q,k)→[공통스키마 후보])로 — 새 소스는 끼우기만
//   ② RRF 융합(순위기반 Σ w/(K+rank)) — 소스별 유사도 스케일 차이로 인한 병합오염 해결
//   ③ 측정을 처음부터(질의·소스·지연·융합결과 → byeoli_search_events) = 버그도구 + 영업무기
//   ④ 설정으로 바꾼다(CONFIG: 가중치/floor/소스토글/캡 = 멀티테넌시 준비)
//   ⑤ 우아한 실패(Promise.allSettled — 한 소스가 죽어도 나머지로 응답)
// 거절: GraphRAG·마이크로서비스·임베딩교체·전면재작성(오버엔지니어링). 기존 소스 함수는 그대로 재사용.
//
// ※ 2026-07-02: 논문 검색(KCI paper + 국회 nanet) 계층 전면 제거 — 책(curate+find+keyword)만 다룬다.
//
// 입력:  { query: string, surface?: 'main'|'float'|'eval'|'api', count?: number, config?: Partial<CONFIG> }
// 응답:  { offtopic, message?, results:[공통후보...], subtitle, note?, meta:{ tookMs, sources, fusion, eventId } }
//   results = 책버킷(curate+find+keyword RRF). 클라 카드 형태 그대로.
// 시크릿: OPENAI 불필요(소스가 알아서). 자동주입 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 로 형제 함수·RPC 호출.
// ───────────────────────────────────────────────────────────────────────────
import { stockMany } from "../_shared/ebook_stock.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE = Deno.env.get("CLAUDE_API_KEY") || "";
const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";   // 고전 소스 질의 임베딩(text-embedding-3-small) — 프로젝트 시크릿(curate와 공유)
const RERANK_MODEL = "claude-haiku-4-5";  // 리랭킹=싸고 빠른 Haiku(curate와 동일)
const FN = (n: string) => `${SB_URL}/functions/v1/${n}`;
const RPC = (n: string) => `${SB_URL}/rest/v1/rpc/${n}`;
const AUTH = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" };

// ── 설정(멀티테넌시 준비: 테넌트별로 이 객체만 덮어쓰면 동작 바뀜) ──
const CONFIG = {
  rrfK: 60,                 // RRF 상수(클수록 하위순위 기여↑, 60=관용)
  // 책버킷 소스 가중치. keyword=정확매칭이라 최상위로, curate=리랭킹된 전자책이 가장 깨끗, find=종이 표면노이즈 다수.
  weights: { keyword: 2.0, curate: 1.6, find: 1.0, classics: 1.4 } as Record<string, number>,
  exactPin: true,           // keyword rk==0(정규화 제목 완전일치)은 RRF 무시하고 최상단 고정(총균쇠 등)
  prefixBoost: 0.02,        // keyword rk==1(접두 일치)에 가산점(살짝 위로, 고정은 아님)
  // 호출 규모(소스별 count) — 융합 전 후보를 넉넉히 받아 RRF 재정렬
  pull: { curate: 12, find: 8, keyword: 6, classics: 6 },
  caps: { books: 5 },       // 최종 책 상한 — 12→5 (2026-08-18 설계 v2: 많이 보여주는 게 좋은 게 아니다. 관련성 울타리 안에서 바로 읽을 수 있는 책 위주)
  enable: { curate: true, find: true, keyword: true, classics: true },
  // 북스타 고전(자체 본문, 310권 = classic_embeddings) — 항상 "지금 바로 읽기"라 즉시읽기 정렬에서 최상위 계층. 유사도 하한 아래는 안 섞는다.
  classicsFloor: 0.33,
  // 즉시읽기 우선 정렬(설계 v2): 검수 통과 후보 중 전자책의 재고를 실시간 확인해 ①바로 읽기 가능 ②재고 미확인 ③종이책 소장 순으로.
  //   대출 중 전자책은 원래 1위였을 때만 1권 허용(맨 위, "대출 중·예약" 배지) — 인기책이 별이에서 영원히 안 보이는 편향 방지.
  availability: true, availabilityTopN: 10, availabilityTimeoutMs: 3500, loanedKeepIfTop1: true,
  // 전소스 리랭킹(2단계, ROI최고): RRF 융합 상위 K를 원 질의로 LLM 재채점(0~3) → minRel 미만 컷 → rel순.
  // curate에만 있던 검수를 융합 전체(find·keyword 표면노이즈 포함)로 확대. Haiku 1콜(curate 내부 rerank 끔=총비용 동일).
  rerank: true, rerankTopK: 16, minRel: 2,   // 24→16: 화면 상한 12라 상위16이면 최선12 포함 → 리랭킹 토큰 ~30%↓(품질 영향0)
  booksFloor: 6,            // 소프트 플로어: 리랭킹 후 도서가 이보다 적으면 rel=1(약간 관련)로 채워 화면이 휑하지 않게(rel=0 무관은 절대 미포함)
  // 3단계 Answer Engine: 검수 통과한 소장 책만 근거로 인용된 답변 합성(환각0+대출연결). 질문유형 게이팅은 모델이 판단(use).
  answer: false,            // 클라가 opt-in(config.answer:true). eval/내부호출은 기본 끔(검색품질만 측정)
  answerModel: "claude-haiku-4-5", answerTopK: 6,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const normT = (t: string) => String(t || "").replace(/\s+/g, "").replace(/[\(\)\[\]:：·,.]/g, "").toLowerCase();
// 시리즈·판본 대표 키(curate similar 모드와 동일 규칙): 부제(:) 앞 본제목 → 권차(". 2", "v.3", "제2권", "(상)") 제거 → 공백·구두점 제거
const seriesKey = (t: string) => String(t || "").replace(/\[[^\]]*\]/g, " ").split(/[:：=\/]/)[0]
  .replace(/\s*[\(（]?\s*(상|중|하|전|후)\s*[\)）]?\s*$/, "")
  .replace(/\s*(?:v\.|vol\.?|제)?\s*\d+\s*(?:권|부|편)?\s*$/i, "")
  .replace(/\s*[.．]\s*\d{1,2}\s+.*$/, "")   // 중간 권차 "설득의 심리학 . 2  Yes를…" → "설득의 심리학"
  .replace(/[\s\-·,.'"’“”()（）]/g, "").toLowerCase();

// ── 공통 후보 스키마 매퍼(클라 *ToCand를 서버로 이전 — 화면은 이제 매핑 안 함) ──
// curate 후보는 이미 카드 형태(toCand) → 통과시키며 표식만 부착.
const fromCurate = (b: any) => ({ ...b, _source: "curate", _kind: b.smEbook ? "ebook" : (b.smPaper ? "paper" : "ebook") });
const fromFind = (c: any) => ({
  isbn: "sm-" + c.key, title: c.title || "", author: c.author || "", publisher: c.publisher || "",
  cover: c.cover || "", year: "", loan: null, description: c.description || "",
  smEbook: false, smEbookUrl: "", smEbookProvider: "",
  smPaper: true, smPaperStatus: "", smPaperUrl: c.detailUrl || ("https://lib.semyung.ac.kr/search/detail/" + c.key),
  crema: false, cremaUrl: "", brcd: c.key,
  _material: c.material || "book", sim: c.similarity, _source: "find", _kind: c.material || "paper",
});
const fromKeyword = (r: any) => (r.src === "ebook"
  ? { isbn: "sm-" + r.id, title: r.title || "", author: r.author || "", publisher: r.publisher || "", cover: r.cover || "", year: "", loan: null, description: r.description || "",
      smEbook: true, smEbookUrl: r.detail_url || "", smPaper: false, smPaperUrl: "",
      crema: r.crema === true, cremaUrl: r.crema_url || "", brcd: r.id, _kw: true, _rk: r.rk, _source: "keyword", _kind: "ebook" }
  : { isbn: "sm-" + r.id, title: r.title || "", author: r.author || "", publisher: r.publisher || "", cover: r.cover || "", year: "", loan: null, description: r.description || "",
      smEbook: false, smEbookUrl: "", smPaper: true, smPaperUrl: r.detail_url || ("https://lib.semyung.ac.kr/search/detail/" + r.id),
      crema: false, cremaUrl: "", brcd: r.id, _material: r.material || "book", _kw: true, _rk: r.rk, _source: "keyword", _kind: r.material || "paper" });

// 북스타 고전(자체 본문) — 카드 키(isbn)에 고전 id(gb-/kr-)를 싣는다. 클라는 _kind==='classic'이면 openDetail(id)로 연다(도서관 상세 아님).
const fromClassic = (c: any) => ({
  isbn: c.id, title: c.title || "", author: c.author || "", publisher: "북스타 고전", cover: c.cover || "", year: c.period || "", loan: null, description: "",
  smEbook: false, smEbookUrl: "", smEbookProvider: "", smPaper: false, smPaperStatus: "", smPaperUrl: "", crema: false, cremaUrl: "", brcd: "",
  _material: "classic", _kind: "classic", _source: "classics", sim: c.similarity, _avail: true,
  _classic: { id: c.id, titleEn: c.title_en || "", genre: c.genre || "", locale: c.locale || "" },
});
async function embedQuery(text: string): Promise<number[] | null> {
  if (!OPENAI) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: "Bearer " + OPENAI, "content-type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 1000) }) });
    const d = await r.json();
    return d?.data?.[0]?.embedding || null;
  } catch { return null; }
}

// ── 동일 인터페이스 retrieve: 소스 호출 → 공통후보[] + 측정({n,ms,ok}). 절대 throw 안 함(우아한 실패). ──
type Pulled = { name: string; items: any[]; ms: number; ok: boolean; raw?: any };
async function pull(name: string, fn: () => Promise<{ items: any[]; raw?: any }>): Promise<Pulled> {
  const t0 = Date.now();
  try {
    const { items, raw } = await fn();
    return { name, items: items || [], ms: Date.now() - t0, ok: true, raw };
  } catch (e) {
    return { name, items: [], ms: Date.now() - t0, ok: false, raw: { error: String(e) } };
  }
}
const postJson = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: AUTH, body: JSON.stringify(body) });
  return await r.json();
};

async function retrieveCurate(q: string, cfg: typeof CONFIG) {
  return pull("curate", async () => {
    // 엔진이 융합 후 전소스 리랭킹을 하므로 curate 내부 rerank는 끈다(이중 검수 방지=비용/지연 절감).
    // 단 엔진 리랭킹을 끈 경우(rerank:false)엔 curate 자체 검수를 살려 품질 유지.
    // skipCrema: 융합용 호출이라 라이브 크레마 조회(최대 4.5s)를 건너뛴다(캐시 crema는 그대로 표시). 지연 절감.
    const d = await postJson(FN("curate"), { query: q, onlyHeld: true, rerank: !cfg.rerank, count: cfg.pull.curate, skipCrema: true });
    if (d && d.offtopic) return { items: [], raw: { offtopic: true, message: d.message || "", subtitle: d.subtitle || "" } };
    const items = (d?.candidates || []).filter((b: any) => b && b.isbn && b.title).map(fromCurate);
    return { items, raw: { subtitle: d?.subtitle || "" } };
  });
}
const retrieveFind = (q: string, cfg: typeof CONFIG) => pull("find", async () => {
  const d = await postJson(FN("semyung-find"), { query: q, count: cfg.pull.find });
  return { items: (d?.candidates || []).map(fromFind) };
});
const retrieveClassics = (q: string, cfg: typeof CONFIG) => pull("classics", async () => {
  const emb = await embedQuery(q);
  if (!emb) return { items: [] };
  const rows = await postJson(RPC("match_classics"), { query_embedding: emb, match_count: cfg.pull.classics });
  return { items: (Array.isArray(rows) ? rows : []).filter((c: any) => c && c.id && c.title && (c.similarity ?? 0) >= cfg.classicsFloor).map(fromClassic) };
});
const retrieveKeyword = (q: string, cfg: typeof CONFIG) => pull("keyword", async () => {
  const rows = await postJson(RPC("keyword_books"), { q, lim: cfg.pull.keyword });
  return { items: (Array.isArray(rows) ? rows : []).map(fromKeyword).filter((b: any) => b.isbn && b.title) };
});

// ── RRF 융합: 순위기반 Σ weight/(K+rank). 소스별 유사도 스케일이 달라도 공정.
//    같은 책이 여러 소스에 뜨면 점수 누적(교차합의 보상) → 표면노이즈는 1소스라 자연 하락.
function rrfFuse(pulls: Pulled[], cfg: typeof CONFIG) {
  const acc = new Map<string, { cand: any; score: number; sources: string[]; pin: boolean; boost: number }>();
  const srcRank: Record<string, number> = { classics: -1, curate: 0, find: 1, keyword: 2 }; // 대표후보 선택 우선순위(고전=자체본문이라 최우선: 바로 읽기 정체성 유지)
  for (const p of pulls) {
    const w = cfg.weights[p.name] ?? 1.0;
    p.items.forEach((cand, rank) => {
      const key = normT(cand.title);
      if (!key) return;
      const add = w / (cfg.rrfK + rank);
      const pin = cfg.exactPin && p.name === "keyword" && cand._rk === 0;
      const boost = (p.name === "keyword" && cand._rk === 1) ? cfg.prefixBoost : 0;
      const cur = acc.get(key);
      if (!cur) { acc.set(key, { cand, score: add, sources: [p.name], pin, boost }); return; }
      cur.score += add; cur.sources.push(p.name); cur.pin = cur.pin || pin; cur.boost = Math.max(cur.boost, boost);
      // 대표 후보는 데이터가 풍부한 소스(curate>find>keyword) 것으로 교체 — 단 형태(전자·종이)와 brcd는 합친다(8/18):
      //   대표가 종이 행이어도 다른 소스가 같은 책의 전자책을 찾았다면 "바로 읽기"를 잃으면 안 된다.
      const useNew = (srcRank[cand._source] ?? 9) < (srcRank[cur.cand._source] ?? 9);
      const merged = { ...(useNew ? cand : cur.cand) };
      const o = useNew ? cur.cand : cand;
      if (o.smEbook && !merged.smEbook) {
        merged.smEbook = true; merged.smEbookUrl = o.smEbookUrl || ""; merged.smEbookProvider = o.smEbookProvider || "";
        if (o.brcd && !/^cattot/i.test(o.brcd)) { merged.brcd = o.brcd; if (/^\d+$/.test(o.brcd)) merged.isbn = "sm-" + o.brcd; }   // 앱 안 대출(lcBorrow)은 sm-숫자 키가 필요
      }
      if (o.smPaper && !merged.smPaper) { merged.smPaper = true; merged.smPaperUrl = o.smPaperUrl || ""; merged.smPaperStatus = o.smPaperStatus || ""; }
      if (!merged.brcd && o.brcd) merged.brcd = o.brcd;
      if (!merged.cover && o.cover) merged.cover = o.cover;
      if (merged.loan == null && o.loan != null) merged.loan = o.loan;
      if (merged._kind !== "classic") merged._kind = merged.smEbook ? "ebook" : (merged.smPaper ? "paper" : (merged._kind || "ebook"));
      cur.cand = merged;
    });
  }
  return [...acc.values()].sort((a, b) =>
    (b.pin ? 1 : 0) - (a.pin ? 1 : 0) ||
    (b.score + b.boost) - (a.score + a.boost) ||
    (b.cand.sim || 0) - (a.cand.sim || 0));
}

// ── 전소스 리랭킹(검수): RRF로 끌어올린 실존 후보를 원 질의 의도와 다시 대조해 무관한 책을 떨군다.
//    환각 0(실존 후보 점수매김). curate에만 있던 검수를 융합 전체로 확대 = find/keyword 표면노이즈(topic 오염) 컷.
const RERANK_TOOL = {
  name: "rerank",
  description: "각 후보 도서가 학생 질의의 실제 의도에 부합하는지 0~3으로 채점",
  input_schema: {
    type: "object",
    properties: {
      scores: { type: "array", items: { type: "integer" },
        description: "입력 순서대로 각 책의 의도 충족도. 0=전혀무관 1=약간 2=관련(주제권) 3=정확히충족. 제목·저자·분류만 보고 판단. 후보 수와 정확히 같은 길이의 배열." },
    },
    required: ["scores"],
  },
};
const RERANK_SYS = "너는 대학 도서관 추천 결과의 적합성 검수자다. 학생 질의의 '실제 의도'에 각 책이 부합하는지 제목·저자·분류만 보고 0~3으로 채점한다. " +
  "주제가 명백히 다르면 0~1(예: '데카르트 이원론'에 자기계발서, '기후변화 비용편익'에 회계감사론 = 0), 같은 주제권이면 2, 핵심 의도를 정확히 충족하면 3. " +
  "목적은 검색이 잘못 끌어온 무관한 책을 솎아내는 것이다. 후하지도 박하지도 않게, 의심스러우면 낮게.";
let lastRerankDiag = "";   // 관찰성: 리랭킹이 안 붙었을 때 이유(meta.fusion.rerank.diag)
async function claudeRerank(query: string, cands: any[]): Promise<number[] | null> {
  if (!CLAUDE || cands.length < 2) { lastRerankDiag = !CLAUDE ? "no_key" : "few_cands"; return null; }
  const list = cands.map((b, i) => `${i + 1}. ${b.title} / ${b.author || "?"} (${b.kdc || b._material || ""})`).join("\n");
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: RERANK_MODEL, max_tokens: 500, temperature: 0,
        system: [{ type: "text", text: RERANK_SYS, cache_control: { type: "ephemeral" } }],
        tools: [RERANK_TOOL], tool_choice: { type: "tool", name: "rerank" },
        messages: [{ role: "user", content: `질의: "${query}"\n후보:\n${list}\n\n각 후보 점수 배열(입력 순서대로, ${cands.length}개).` }],
      }),
    });
    const d = await r.json();
    const sc = (d.content || []).find((c: any) => c.type === "tool_use")?.input?.scores;
    if (!Array.isArray(sc) || sc.length !== cands.length) { lastRerankDiag = `http ${r.status} len ${Array.isArray(sc) ? sc.length : "none"}/${cands.length} ${String(d?.error?.message || d?.stop_reason || "").slice(0, 80)}`; return null; }
    lastRerankDiag = ""; return sc.map((x: any) => Number(x) || 0);
  } catch (e) { lastRerankDiag = "err " + String(e).slice(0, 80); return null; }
}
// 책버킷 리랭킹: RRF 융합 상위 K를 한 번의 Haiku 호출로 검수(find/keyword 표면노이즈 컷).
//   minRel 미만 컷 후 rel순(동점=RRF·인기). topK 밖은 검수 못 했으니 버림(표시=전부 통과만, curate와 동일).
async function rerankBooks(query: string, books: any[], cfg: typeof CONFIG) {
  const bHead = books.slice(0, cfg.rerankTopK);
  if (bHead.length < 2) return { books, meta: { applied: false } };
  const scores = await claudeRerank(query, bHead.map((e) => e.cand));
  if (!scores) return { books, meta: { applied: false, diag: lastRerankDiag } };
  const tagged = bHead.map((e, i) => ({ ...e, rel: scores[i] }));
  const sortKept = (arr: any[]) => arr.filter((e) => e.rel >= cfg.minRel)
    .sort((a, b) => b.rel - a.rel || (b.score + b.boost) - (a.score + a.boost) || (b.cand.loan || 0) - (a.cand.loan || 0))
    .map((e) => ({ ...e, cand: { ...e.cand, _rel: e.rel } }));
  let keptB = sortKept(tagged);
  // 소프트 플로어 — 도서가 booksFloor 미만이면 rel=1(약간 관련)로만 보충(rel=0 무관은 절대 제외). 빈약 화면 방지.
  //   단 정확매칭(keyword 완전일치 pin) 또는 rel=3 정확충족 책이 있으면 채우지 않는다 — "총균쇠"에 무관한 역사류로 오염 방지.
  const hasExact = tagged.some((e: any) => e.pin || e.rel >= 3);
  let filled = 0;
  if (keptB.length < cfg.booksFloor && !hasExact) {
    const have = new Set(keptB.map((e) => e.cand.isbn));
    const fillers = tagged
      .filter((e) => e.rel === 1 && !have.has(e.cand.isbn))
      .sort((a, b) => (b.score + b.boost) - (a.score + a.boost) || (b.cand.loan || 0) - (a.cand.loan || 0))
      .slice(0, cfg.booksFloor - keptB.length)
      .map((e) => ({ ...e, cand: { ...e.cand, _rel: e.rel, _fill: true } }));
    filled = fillers.length;
    keptB = keptB.concat(fillers);
  }
  return { books: keptB, meta: { applied: true, model: RERANK_MODEL, minRel: cfg.minRel,
    booksBefore: bHead.length, booksAfter: keptB.length, booksFilled: filled } };
}

// ── 3단계 Answer Engine: 검수 통과한 '우리 소장 자료'만 근거로 인용된 답변 합성.
//   환각 0(책·소장 언급은 목록 번호 [n]으로만) + 질문유형 게이팅(감정·탐색이면 use=false=목록이 자연스럽다).
const ANSWER_TOOL = {
  name: "answer",
  description: "학생 질문에 우리 도서관 소장 자료를 바탕으로 짧게 답하거나, 답이 부적절하면 use=false",
  input_schema: {
    type: "object",
    properties: {
      use: { type: "boolean", description: "개념·지식·정보를 묻는 질문이면 true(답 합성). 감정·기분·위로·가벼운 책탐색이면 false(목록 카드가 자연스럽다)." },
      text: { type: "string", description: "2~3문장 한국어 답. 아래 책들을 주제·수준·범위로 묶어 자연스럽게 소개(예 '기초 입문서부터 천문학 교양서까지'). ⚠️개별 책을 번호([n])나 제목으로 일일이 집지 마라(목록 카드가 바로 아래 보임=제목 나열 불필요). 목록에 없는 책·사실 지어내기 금지. use=false면 빈 문자열." },
    },
    required: ["use", "text"],
  },
};
const ANSWER_SYS = "너는 세명대학교 도서관 AI 사서 '별이'다. 학생 질문에, 아래 '우리 도서관 소장 자료'를 바탕으로 2~3문장으로 따뜻하고 간결하게 답한다. " +
  "①목록에 없는 책·저자·사실을 지어내지 마라(환각 금지). " +
  "②개별 책을 번호([n])나 제목으로 일일이 집지 말고, 책들의 주제·수준·범위를 묶어 자연스럽게 소개해라(예: '우주의 기초를 다지는 입문서부터 별과 천문학을 쉽게 풀어낸 교양서까지'). 목록 카드가 바로 아래 보이므로 제목 나열은 불필요하고, 문장이 술술 읽히게 하는 게 가장 중요하다. " +
  "③질문이 개념·지식·정보형이면 핵심을 짧고 정확히 설명. 확실치 않으면 단정하지 마라. 감정·기분·위로·가벼운 탐색이면 답을 짓지 말고 use=false(책 카드가 더 자연스럽다). " +
  "④인사말·면책문구·군더더기·마크다운·번호([n]) 금지.";
async function claudeAnswer(query: string, list: string, model: string): Promise<any | null> {
  if (!CLAUDE) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 400, temperature: 0.2,
        system: [{ type: "text", text: ANSWER_SYS, cache_control: { type: "ephemeral" } }],
        tools: [ANSWER_TOOL], tool_choice: { type: "tool", name: "answer" },
        messages: [{ role: "user", content: `질문: "${query}"\n\n우리 도서관 소장 자료:\n${list}\n\n위 자료만 근거로 답하거나, 부적절하면 use=false.` }],
      }),
    });
    const d = await r.json();
    return (d.content || []).find((c: any) => c.type === "tool_use")?.input ?? null;
  } catch { return null; }
}
// 표시되는 책(book kind)만 근거로 답 합성.
async function composeAnswer(query: string, bookItems: any[], cfg: typeof CONFIG) {
  const top = bookItems.filter((b) => (b._rel ?? 2) >= 2).slice(0, cfg.answerTopK);
  if (top.length < 1) return { used: false };
  const list = top.map((c) => {
    const desc = String(c.description || "").replace(/\s+/g, " ").slice(0, 100);
    return `- ${c.title} / ${c.author || "?"}${c.kdc ? ` (${c.kdc})` : ""}${desc ? ` — ${desc}` : ""}`;
  }).join("\n");
  const tp = await claudeAnswer(query, list, cfg.answerModel);
  if (!tp || tp.use !== true || !String(tp.text || "").trim()) return { used: false };
  // 번호 인용 폐지(가독성) — 혹시 모델이 [n]을 남겨도 제거하고 주제 요약 문단만 반환.
  const text = String(tp.text || "").trim().replace(/\s*\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
  return { used: true, text };
}

// ── #1 질의이해: 영어/로마자 질의 → 한글 표제 변환. 한글이 든 질의는 절대 거치지 않음(지연·비용 0).
//   라틴 위주(한글 0 + 영문자 2+)만 트리거. Haiku 1콜 + 인스턴스 캐시(같은 질의 반복 무과금).
//   예: "harry potter"→"해리 포터", "the great gatsby"→"위대한 개츠비", "machine learning"→"머신러닝".
//   실데이터(MARC 원서명 인덱싱) 오면 변환 없이도 영어검색 정식지원 → 이 레이어는 그때까지의 다리 + 상시 폴백.
const translitCache = new Map<string, string>();
const needsTranslit = (q: string) => /[a-zA-Z]{2,}/.test(q) && !/[가-힣]/.test(q);
const TRANSLIT_TOOL = {
  name: "to_korean",
  description: "영어/로마자 도서 검색어를 한국 대학도서관 목록에서 쓰는 한글 표기로 변환",
  input_schema: {
    type: "object",
    properties: {
      ko: { type: "string", description: "한국 대학도서관 목록에서 이 책/주제를 찾을 때 쓰는 가장 자연스러운 한글 검색어. 유명 도서는 정식 한글 표제(harry potter→해리 포터, the great gatsby→위대한 개츠비), 개념·주제어는 번역 또는 음차(machine learning→머신러닝). 변환이 무의미하면 원문 그대로 반환." },
    },
    required: ["ko"],
  },
};
async function claudeTransliterate(q: string): Promise<string> {
  if (!CLAUDE) return "";
  const key = q.toLowerCase().trim();
  if (translitCache.has(key)) return translitCache.get(key)!;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: RERANK_MODEL, max_tokens: 80, temperature: 0,
        tools: [TRANSLIT_TOOL], tool_choice: { type: "tool", name: "to_korean" },
        messages: [{ role: "user", content: `검색어: "${q}"` }],
      }),
    });
    const d = await r.json();
    const ko = String((d.content || []).find((c: any) => c.type === "tool_use")?.input?.ko || "").trim();
    translitCache.set(key, ko);
    return ko;
  } catch { return ""; }
}

async function logEvent(row: any): Promise<number | null> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/byeoli_search_events`, {
      method: "POST", headers: { ...AUTH, Prefer: "return=representation" }, body: JSON.stringify(row),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d) && d[0] ? d[0].id : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query || "").trim();
    const surface = String(body.surface || "api");
    const cfg = { ...CONFIG, ...(body.config || {}) };
    cfg.weights = { ...CONFIG.weights, ...((body.config || {}).weights || {}) };
    cfg.enable = { ...CONFIG.enable, ...((body.config || {}).enable || {}) };
    cfg.caps = { ...CONFIG.caps, ...((body.config || {}).caps || {}) };
    cfg.pull = { ...CONFIG.pull, ...((body.config || {}).pull || {}) };   // 깊은 병합(부분 pull 전달 시 나머지 소스 count 유실 방지 = 멀티테넌시)
    if (!query) return json({ offtopic: false, results: [], subtitle: "", meta: { tookMs: 0, sources: {}, error: "empty_query" } });

    // #1 질의이해 — 라틴 위주 질의(한글 0 + 영문자 2+)만 한글 표제로 변환해 검색. 한글 질의는 미접촉(지연/비용 0).
    let qSearch = query; let translit: { from: string; to: string } | null = null;
    if (needsTranslit(query)) {
      const ko = await claudeTransliterate(query);
      if (ko && normT(ko) !== normT(query)) { qSearch = ko; translit = { from: query, to: ko }; }
    }

    // 1차 병렬(우아한 실패: allSettled). curate가 offtopic이면 즉시 거절(책 게이트).
    const tasks: Promise<Pulled>[] = [];
    if (cfg.enable.curate) tasks.push(retrieveCurate(qSearch, cfg));
    if (cfg.enable.find) tasks.push(retrieveFind(qSearch, cfg));
    if (cfg.enable.keyword) tasks.push(retrieveKeyword(qSearch, cfg));
    if (cfg.enable.classics) tasks.push(retrieveClassics(qSearch, cfg));
    const settled = await Promise.allSettled(tasks);
    const pulls: Pulled[] = settled.map((s) => s.status === "fulfilled" ? s.value : { name: "?", items: [], ms: 0, ok: false });
    const byName = (n: string) => pulls.find((p) => p.name === n);

    const curate = byName("curate");
    const curateRaw = curate?.raw || {};
    const subtitle = curateRaw.subtitle || "";
    // curate offtopic 게이트는 Haiku 단일콜이라 정상 책질의를 간헐 오거절함(양자역학·'떡볶이' 제목·하루끼 등).
    // → 검색(keyword/find)이 실책을 찾아냈으면 '분류기보다 검색결과를 신뢰'해 거절을 뒤집는다. 진짜 비도서(날씨·ㅁㄴㅇㄹ)는
    //   keyword/find도 0이라 그대로 거절된다(오탐만 구제, 정탐 유지).
    if (curateRaw.offtopic) {
      const kw = byName("keyword"); const fnd = byName("find");
      const retrievedElsewhere = ((kw?.items.length || 0) + (fnd?.items.length || 0)) > 0;
      if (!retrievedElsewhere) {
        const eventId = await logEvent({ surface, query, offtopic: true, total_ms: Date.now() - t0, result_count: 0,
          sources: Object.fromEntries(pulls.map((p) => [p.name, { n: p.items.length, ms: p.ms, ok: p.ok }])), fusion: null, top_results: [] });
        return json({ offtopic: true, message: curateRaw.message || "", results: [], subtitle: "", meta: { tookMs: Date.now() - t0, sources: {}, eventId } });
      }
      // 뒤집음: curate는 후보 0이지만 keyword/find가 책을 찾음 → 그 소스들로 정상 응답 진행.
    }

    // 2) RRF 융합 — 책 버킷(curate+find+keyword).
    const bookPulls = [byName("curate"), byName("find"), byName("keyword"), byName("classics")].filter(Boolean) as Pulled[];
    let fusedBooks = rrfFuse(bookPulls, cfg);

    // 2.5) 리랭킹 — 책 버킷을 원 질의로 재채점 → 무관책 컷.
    let rerankMeta: any = { applied: false };
    if (cfg.rerank) {
      const rr = await rerankBooks(qSearch, fusedBooks, cfg);
      fusedBooks = rr.books; rerankMeta = rr.meta;
    }

    // 3) 조립: 책 버킷만. 제목 dedup. (풀은 넉넉히 받아두고 — 즉시읽기 정렬 뒤 caps로 자른다)
    const seen = new Set<string>();
    let out: any[] = [];
    const poolCap = Math.max(cfg.caps.books, cfg.availability ? cfg.availabilityTopN : 0);
    for (const e of fusedBooks) { const k = normT(e.cand.title); if (!seen.has(k)) { seen.add(k); out.push({ ...e.cand, _rrf: +(e.score + e.boost).toFixed(5), _srcs: e.sources }); } if (out.length >= poolCap) break; }

    // 3.5) 즉시읽기 우선 정렬(2026-08-18 설계 v2, _추천설계_20260818.md) — 울타리(검수 통과)는 그대로, 순서만 바꾼다.
    //   전자책 상위 N권 재고 실시간 확인 → ①바로 읽기 가능 ②재고 미확인 ③종이책 소장(앱 밖에서 읽기) → 각 계층 안에서 rel → 인기(loan) → RRF.
    //   대출 중 전자책은 원래 1위였을 때만 1권 유지(맨 위, 클라가 "대출 중·예약하기"로 표시). 나머지 대출 중은 제외.
    let availMeta: any = { applied: false };
    if (cfg.availability && out.length) {
      const t1 = Date.now();
      const isEb = (b: any) => b.smEbook === true && /^[0-9A-Za-z]+$/.test(String(b.brcd || "")) && !/^cattot/i.test(String(b.brcd || ""));
      const targets = out.filter(isEb).slice(0, cfg.availabilityTopN).map((b: any) => String(b.brcd));
      const st = targets.length ? await stockMany(targets, { concurrency: 8, timeoutMs: cfg.availabilityTimeoutMs }) : new Map();
      out = out.map((b: any) => {
        if (b._kind === "classic") return { ...b, _avail: true };   // 자체 본문 = 항상 열림
        if (!isEb(b)) return { ...b, _avail: null };
        const s = st.get(String(b.brcd));
        return { ...b, _avail: s ? s.available : null, _stock: s ? { loaned: s.loaned, total: s.total, reserved: s.reserved } : undefined };
      });
      const tier = (b: any) => b._kind === "classic" ? 0 : (b.smEbook === true ? (b._avail === true ? 0 : (b._avail === null ? 1 : 3)) : 2);
      const top1 = out[0];
      const keepLoaned = (cfg.loanedKeepIfTop1 && top1 && tier(top1) === 3) ? top1 : null;
      const ranked = out.map((b: any, i: number) => ({ b, i, t: tier(b) }))
        .filter((x) => x.t < 3 || (keepLoaned && x.b === keepLoaned))
        .sort((x, y) => x.t - y.t || ((y.b._rel ?? 2) - (x.b._rel ?? 2)) || ((y.b.loan || 0) - (x.b.loan || 0)) || x.i - y.i);
      let list = ranked.map((x) => x.b);
      if (keepLoaned) list = [keepLoaned, ...list.filter((b) => b !== keepLoaned)];
      // 대출 중을 다 뺐더니 2권도 안 남으면 대출 중 후보로 보충(원순서) — "못 찾는 별이"가 되면 안 된다
      if (list.length < 2) { for (const b of out) { if (!list.includes(b)) { list.push(b); if (list.length >= 2) break; } } }
      availMeta = { applied: true, checked: targets.length,
        avail: out.filter((b: any) => b._avail === true).length, loaned: out.filter((b: any) => b._avail === false).length,
        unknown: out.filter((b: any) => b.smEbook && b._avail === null).length, keptLoanedTop1: !!keepLoaned, ms: Date.now() - t1 };
      out = list;
    }
    // 3.7) 시리즈·판본은 대표 1권(설계 v2 공통 규칙) — "설득의 심리학 1·2·3", "내 여자의 열매 : 소설/소설집" 같은 중복이 5칸을 다 먹지 않게.
    //   즉시읽기 정렬 '뒤'에 하므로 전자책(바로 읽기) 판본이 종이 판본을 이기고 대표로 남는다.
    {
      const seenS = new Set<string>(); const dd: any[] = [];
      // 저자 첫 토큰을 키에 섞어 '같은 본제목·다른 책'(예: 「사랑」 시집 vs 소설)의 과병합을 막는다
      const authKey = (a: string) => String(a || "").split(/[,\s;/]+/)[0].replace(/[^가-힣a-z0-9]/gi, "").toLowerCase();
      for (const b of out) { const k = (seriesKey(b.title) || normT(b.title)) + "|" + authKey(b.author); if (seenS.has(k)) continue; seenS.add(k); dd.push(b); }
      out = dd;
    }
    out = out.slice(0, cfg.caps.books);

    // 4) Answer Engine — 표시되는 책(검수통과 소장자료)만 근거로 답 합성(opt-in). 감정/탐색이면 모델이 use=false.
    let answer: any = { used: false };
    if (cfg.answer && out.length) {
      answer = await composeAnswer(qSearch, out, cfg);
    }

    const sources = Object.fromEntries(pulls.map((p) => [p.name, { n: p.items.length, ms: p.ms, ok: p.ok }]));
    const fusion = { rrfK: cfg.rrfK, weights: cfg.weights, bookBucket: fusedBooks.length, rerank: rerankMeta, availability: availMeta };
    const top_results = out.slice(0, 8).map((b) => ({ title: b.title, source: b._source, rrf: b._rrf, rel: b._rel ?? null, kind: b._kind, avail: b._avail ?? null }));
    const eventId = await logEvent({ surface, query, offtopic: false, total_ms: Date.now() - t0, result_count: out.length, sources,
      fusion: { ...fusion, answer: { used: answer.used }, translit }, top_results,
      rrf_top: fusedBooks.slice(0, 5).map((e) => ({ t: e.cand.title, s: +(e.score).toFixed(4), src: e.sources })) });

    return json({ offtopic: false, results: out, answer, subtitle, meta: { tookMs: Date.now() - t0, sources, fusion, translit, eventId } });
  } catch (e) {
    return json({ offtopic: false, results: [], subtitle: "", meta: { tookMs: Date.now() - t0, sources: {}, error: String(e) } }, 200);
  }
});
