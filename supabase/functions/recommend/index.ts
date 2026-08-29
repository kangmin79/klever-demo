// 클레버 AI 도서 추천 Edge Function
// 입력: { query: "자연어 한 줄" }
// 흐름: 라우터(정확검색 vs 의미검색) → entity는 DB 조회 / semantic은 성인 풀 전체를 캐시 프롬프트에 통째로 → AI 큐레이션
// 시크릿(env): SB_URL, SB_ANON, CLAUDE_API_KEY

const SB_URL = Deno.env.get("SB_URL")!;
const SB_ANON = Deno.env.get("SB_ANON")!;
const CLAUDE = Deno.env.get("CLAUDE_API_KEY")!;
const MODEL = "claude-haiku-4-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// --- Supabase REST 헬퍼 ---
async function sbFetch(qs: string) {
  // 어린이·학습만화 제외 (대학생 대상 앱). not.is.true → false + NULL 모두 포함(미플래그 누락 방지)
  const r = await fetch(`${SB_URL}/rest/v1/books?${qs}&is_kids=not.is.true`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
  });
  return r.ok ? await r.json() : [];
}

const SELECT = "isbn13,title,author,publisher,pub_year,cover,rating,rating_count,pages,description,category,kdc,loan_count,keywords,co_books";

// --- 성인 풀 전체 캐시 (콜드스타트당 1회, 10분 TTL) ---
// 풀이 작아(수백~2천 권) 통째로 메모리에 들고, semantic 큐레이션 프롬프트에 그대로 주입한다.
let POOL: any[] | null = null;
let POOL_TS = 0;
async function getPool(): Promise<any[]> {
  if (POOL && Date.now() - POOL_TS < 600_000) return POOL;
  const all: any[] = [];
  // 안전하게 페이지네이션(최대 2000권). 정렬은 캐시 키 안정성을 위해 isbn13 고정.
  for (let off = 0; off < 2000; off += 1000) {
    const page = await sbFetch(`select=${SELECT}&order=isbn13.asc&offset=${off}&limit=1000`);
    all.push(...page);
    if (page.length < 1000) break;
  }
  POOL = all;
  POOL_TS = Date.now();
  return all;
}

// --- Anthropic 호출(툴 강제 → 구조화 출력) ---
async function claudeTool(system: any[], user: string, tool: any, maxTokens = 800) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }],
  };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  const tu = (data.content || []).find((c: any) => c.type === "tool_use");
  return tu?.input ?? null;
}

const ROUTER_TOOL = {
  name: "route",
  description: "검색어를 분석해 검색 유형을 분류",
  input_schema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["entity", "semantic"], description: "특정 작가/제목/출판사를 콕 집어 찾으면 entity, 기분·상황·주제·추천요청이면 semantic" },
      author: { type: "string", description: "작가명(entity일 때만)" },
      title: { type: "string", description: "책 제목 일부(entity일 때만)" },
      publisher: { type: "string", description: "출판사명(entity일 때만)" },
    },
    required: ["mode"],
  },
};

const CURATE_TOOL = {
  name: "recommend",
  description: "후보 도서 중 사용자에게 어울리는 책을 골라 이유와 함께 반환",
  input_schema: {
    type: "object",
    properties: {
      intro: { type: "string", description: "아주 짧은 한 문장(20자 내외) 인사. 예: '지친 마음을 다독여줄 책들이에요'" },
      picks: {
        type: "array",
        description: "추천 순서대로(가장 잘 맞는 책이 맨 앞). 어울리는 만큼 최소 8권 ~ 최대 20권.",
        items: {
          type: "object",
          properties: {
            id: { type: "integer", description: "[도서 풀] 각 줄 맨 앞 대괄호 안의 번호(예: [42] 이면 42). 풀에 있는 번호만." },
            reason: { type: "string", description: "왜 이 책인지 딱 한 문장(40자 이내), 짧고 인상적으로. 군더더기·중복 금지" },
          },
          required: ["id", "reason"],
        },
      },
    },
    required: ["intro", "picks"],
  },
};

function poolLine(b: any, i: number) {
  // 13자리 ISBN 대신 짧은 정수 index 사용 → 모델의 ID 오기(誤記) 방지
  const kw = (b.keywords || []).slice(0, 4).join(", ");
  const d = (b.description || "").slice(0, 60);
  const loan = b.loan_count ? `대출${b.loan_count}` : "대출-";
  return `[${i}] 《${b.title}》 ${b.author} | ★${b.rating ?? "-"} ${loan} | 키워드: ${kw} | ${d}`;
}

const ilike = (v: string) => `*${v.replace(/[*,()]/g, " ").trim()}*`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { query } = await req.json();
    if (!query || !query.trim()) return json({ error: "query 비었음" }, 400);
    if (String(query).length > 400) return json({ error: "질문이 너무 길어요 (400자 이내)" }, 400);   // 8/29 비용 상한

    // 1) 라우터 (entity vs semantic 구분만)
    const route = await claudeTool(
      [{ type: "text", text: "너는 도서 검색어 분석기다. 입력이 특정 작가/책제목/출판사를 콕 집어 가리키면 entity, 기분·상황·주제·추천요청이면 semantic으로 분류한다. 예: '무라카미 하루키'→entity,author / '사피엔스'→entity,title / '위로받고 싶어'→semantic / '조선시대 역사책'→semantic.", cache_control: { type: "ephemeral" } }],
      query, ROUTER_TOOL, 250,
    ) || { mode: "semantic" };

    // 2-A) entity: DB 정확 조회 (이유 = 책 소개)
    if (route.mode === "entity") {
      const ors: string[] = [];
      if (route.author) ors.push(`author.ilike.${ilike(route.author)}`);
      if (route.title) ors.push(`title.ilike.${ilike(route.title)}`);
      if (route.publisher) ors.push(`publisher.ilike.${ilike(route.publisher)}`);
      if (!ors.length) ors.push(`title.ilike.${ilike(query)}`, `author.ilike.${ilike(query)}`);
      const rows = await sbFetch(`select=${SELECT}&or=(${ors.join(",")})&order=loan_count.desc.nullslast&limit=20`);
      const results = rows.map((b: any) => ({ ...b, reason: (b.description || "").slice(0, 120) }));
      return json({ mode: "entity", route, intro: `'${route.author || route.publisher || route.title || query}' 검색 결과예요`, results });
    }

    // 2-B) semantic: 성인 풀 '전체'를 캐시 프롬프트에 통째로 → 키워드 ilike 쏠림 소멸
    const pool = await getPool();
    const sys = [
      {
        type: "text",
        text: "너는 대학생 독서앱 'Bookstar'의 도서 큐레이터다. 아래 [도서 풀]에 있는 책만 추천하고, 풀에 없는 책은 절대 지어내지 않는다. 각 책은 줄 맨 앞 [번호]로 가리킨다. 사용자의 기분·상황·주제를 읽고 가장 잘 어울리는 책을 '추천 순서대로'(가장 잘 맞는 책이 맨 앞) 골라라. 어울리는 책이 많으면 최대 20권까지, 보통 12권 안팎, 최소 8권은 채운다. 각 책마다 [번호]와 함께 '왜 이 책인지'를 딱 한 문장(40자 이내)으로 짧고 인상적으로 쓴다. 번호와 이유가 반드시 같은 책을 가리키게 하라. 같은 시리즈·중복 주제로만 채우지 말고 다양하게. 인트로도 한 문장으로 짧게.\n\n[도서 풀]\n" +
          pool.map(poolLine).join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ];
    const out = await claudeTool(sys, query, CURATE_TOOL, 2200) || { intro: "이런 책 어떠세요", picks: [] };
    const results = (out.picks || [])
      .map((p: any) => ({ ...(pool[p.id] || {}), reason: p.reason }))
      .filter((b: any) => b && b.isbn13);
    return json({ mode: "semantic", route, intro: out.intro, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
