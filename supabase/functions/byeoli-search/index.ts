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
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLAUDE = Deno.env.get("CLAUDE_API_KEY") || "";
const RERANK_MODEL = "claude-haiku-4-5";  // 리랭킹=싸고 빠른 Haiku(curate와 동일)
const FN = (n: string) => `${SB_URL}/functions/v1/${n}`;
const RPC = (n: string) => `${SB_URL}/rest/v1/rpc/${n}`;
const AUTH = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" };

// ── 설정(멀티테넌시 준비: 테넌트별로 이 객체만 덮어쓰면 동작 바뀜) ──
const CONFIG = {
  rrfK: 60,                 // RRF 상수(클수록 하위순위 기여↑, 60=관용)
  // 책버킷 소스 가중치. keyword=정확매칭이라 최상위로, curate=리랭킹된 전자책이 가장 깨끗, find=종이 표면노이즈 다수.
  weights: { keyword: 2.0, curate: 1.6, find: 1.0 } as Record<string, number>,
  exactPin: true,           // keyword rk==0(정규화 제목 완전일치)은 RRF 무시하고 최상단 고정(총균쇠 등)
  prefixBoost: 0.02,        // keyword rk==1(접두 일치)에 가산점(살짝 위로, 고정은 아님)
  // 호출 규모(소스별 count) — 융합 전 후보를 넉넉히 받아 RRF 재정렬
  pull: { curate: 12, find: 8, keyword: 6 },
  caps: { books: 12 },      // 최종 책 상한
  enable: { curate: true, find: true, keyword: true },
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
const retrieveKeyword = (q: string, cfg: typeof CONFIG) => pull("keyword", async () => {
  const rows = await postJson(RPC("keyword_books"), { q, lim: cfg.pull.keyword });
  return { items: (Array.isArray(rows) ? rows : []).map(fromKeyword).filter((b: any) => b.isbn && b.title) };
});

// ── RRF 융합: 순위기반 Σ weight/(K+rank). 소스별 유사도 스케일이 달라도 공정.
//    같은 책이 여러 소스에 뜨면 점수 누적(교차합의 보상) → 표면노이즈는 1소스라 자연 하락.
function rrfFuse(pulls: Pulled[], cfg: typeof CONFIG) {
  const acc = new Map<string, { cand: any; score: number; sources: string[]; pin: boolean; boost: number }>();
  const srcRank: Record<string, number> = { curate: 0, find: 1, keyword: 2 }; // 대표후보 선택 우선순위
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
      // 대표 후보는 데이터가 풍부한 소스(curate>find>keyword) 것으로 교체
      if ((srcRank[cand._source] ?? 9) < (srcRank[cur.cand._source] ?? 9)) cur.cand = cand;
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
async function claudeRerank(query: string, cands: any[]): Promise<number[] | null> {
  if (!CLAUDE || cands.length < 2) return null;
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
    return Array.isArray(sc) && sc.length === cands.length ? sc.map((x: any) => Number(x) || 0) : null;
  } catch { return null; }
}
// 책버킷 리랭킹: RRF 융합 상위 K를 한 번의 Haiku 호출로 검수(find/keyword 표면노이즈 컷).
//   minRel 미만 컷 후 rel순(동점=RRF·인기). topK 밖은 검수 못 했으니 버림(표시=전부 통과만, curate와 동일).
async function rerankBooks(query: string, books: any[], cfg: typeof CONFIG) {
  const bHead = books.slice(0, cfg.rerankTopK);
  if (bHead.length < 2) return { books, meta: { applied: false } };
  const scores = await claudeRerank(query, bHead.map((e) => e.cand));
  if (!scores) return { books, meta: { applied: false } };
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
    const bookPulls = [byName("curate"), byName("find"), byName("keyword")].filter(Boolean) as Pulled[];
    let fusedBooks = rrfFuse(bookPulls, cfg);

    // 2.5) 리랭킹 — 책 버킷을 원 질의로 재채점 → 무관책 컷.
    let rerankMeta: any = { applied: false };
    if (cfg.rerank) {
      const rr = await rerankBooks(qSearch, fusedBooks, cfg);
      fusedBooks = rr.books; rerankMeta = rr.meta;
    }

    // 3) 조립: 책 버킷만. 제목 dedup.
    const seen = new Set<string>();
    const out: any[] = [];
    for (const e of fusedBooks) { const k = normT(e.cand.title); if (!seen.has(k)) { seen.add(k); out.push({ ...e.cand, _rrf: +(e.score + e.boost).toFixed(5), _srcs: e.sources }); } if (out.length >= cfg.caps.books) break; }

    // 4) Answer Engine — 표시되는 책(검수통과 소장자료)만 근거로 답 합성(opt-in). 감정/탐색이면 모델이 use=false.
    let answer: any = { used: false };
    if (cfg.answer && out.length) {
      answer = await composeAnswer(qSearch, out, cfg);
    }

    const sources = Object.fromEntries(pulls.map((p) => [p.name, { n: p.items.length, ms: p.ms, ok: p.ok }]));
    const fusion = { rrfK: cfg.rrfK, weights: cfg.weights, bookBucket: fusedBooks.length, rerank: rerankMeta };
    const top_results = out.slice(0, 8).map((b) => ({ title: b.title, source: b._source, rrf: b._rrf, rel: b._rel ?? null, kind: b._kind }));
    const eventId = await logEvent({ surface, query, offtopic: false, total_ms: Date.now() - t0, result_count: out.length, sources,
      fusion: { ...fusion, answer: { used: answer.used }, translit }, top_results,
      rrf_top: fusedBooks.slice(0, 5).map((e) => ({ t: e.cand.title, s: +(e.score).toFixed(4), src: e.sources })) });

    return json({ offtopic: false, results: out, answer, subtitle, meta: { tookMs: Date.now() - t0, sources, fusion, translit, eventId } });
  } catch (e) {
    return json({ offtopic: false, results: [], subtitle: "", meta: { tookMs: Date.now() - t0, sources: {}, error: String(e) } }, 200);
  }
});
