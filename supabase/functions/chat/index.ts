// 북스타 학생용 AI 사서 챗봇 Edge Function
// 입력: { messages: [{ role: "user"|"assistant", content: "..." }, ...] }  // 대화 전체 히스토리
// 흐름: books 성인 풀 전체를 캐시 시스템 프롬프트에 통째로 → Haiku가 대화 맥락 읽고
//        사서처럼 답하면서, 추천할 책이 있으면 카드(picks)로 함께 반환
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

// --- Supabase REST 헬퍼 (recommend와 동일 풀) ---
async function sbFetch(qs: string) {
  // 어린이·학습만화 제외 (대학생 대상 앱)
  const r = await fetch(`${SB_URL}/rest/v1/books?${qs}&is_kids=not.is.true`, {
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
  });
  return r.ok ? await r.json() : [];
}

const SELECT = "isbn13,title,author,publisher,pub_year,cover,rating,rating_count,pages,description,category,kdc,loan_count,keywords,co_books";

// --- 성인 풀 전체 캐시 (콜드스타트당 1회, 10분 TTL) ---
let POOL: any[] | null = null;
let POOL_TS = 0;
async function getPool(): Promise<any[]> {
  if (POOL && Date.now() - POOL_TS < 600_000) return POOL;
  const all: any[] = [];
  for (let off = 0; off < 2000; off += 1000) {
    const page = await sbFetch(`select=${SELECT}&order=isbn13.asc&offset=${off}&limit=1000`);
    all.push(...page);
    if (page.length < 1000) break;
  }
  POOL = all;
  POOL_TS = Date.now();
  return all;
}

// --- Anthropic 호출 (대화 히스토리 + 툴 강제 → 구조화 출력) ---
async function claudeChat(system: any[], messages: any[], tool: any, maxTokens = 1200) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages,
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

const REPLY_TOOL = {
  name: "reply",
  description: "학생에게 보낼 사서의 대화 메시지와, 이번 답변에서 카드로 보여줄 책 목록",
  input_schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description:
          "사서가 학생에게 건네는 말. 따뜻하고 자연스러운 구어체 1~3문장. 추천 책이 있으면 '이런 책들 골라봤어요' 식으로 짧게 운을 띄우고, 정보가 부족하면 한 가지만 되묻는다. 책 제목을 길게 나열하지 말 것(카드로 따로 보여주니까).",
      },
      picks: {
        type: "array",
        description:
          "이번 답변에서 카드로 보여줄 책. 추천 흐름일 때만 채우고(보통 3~6권, 가장 잘 맞는 책이 맨 앞), 그냥 대화/되묻기 차례면 빈 배열. 풀에 있는 [번호]만.",
        items: {
          type: "object",
          properties: {
            id: { type: "integer", description: "[도서 풀] 각 줄 맨 앞 대괄호 안의 번호. 풀에 있는 번호만." },
            reason: { type: "string", description: "왜 이 책인지 딱 한 문장(40자 이내), 짧고 인상적으로." },
          },
          required: ["id", "reason"],
        },
      },
    },
    required: ["message", "picks"],
  },
};

function poolLine(b: any, i: number) {
  const kw = (b.keywords || []).slice(0, 4).join(", ");
  const d = (b.description || "").slice(0, 60);
  const loan = b.loan_count ? `대출${b.loan_count}` : "대출-";
  return `[${i}] 《${b.title}》 ${b.author} | ★${b.rating ?? "-"} ${loan} | 키워드: ${kw} | ${d}`;
}

const PERSONA =
  "너는 대학 도서관 학생 독서앱 'Bookstar(북스타)'의 AI 사서다. 학생과 자연스럽게 대화하며 책을 추천한다.\n" +
  "성격: 따뜻하고 다정하지만 과하지 않게, 진짜 단골 학생을 아는 동네 사서처럼. 반말 금지(존댓말), 너무 딱딱하지도 않게.\n" +
  "규칙:\n" +
  "1) 아래 [도서 풀]에 있는 책만 추천한다. 풀에 없는 책 제목·작가를 절대 지어내지 않는다.\n" +
  "2) 각 책은 줄 맨 앞 [번호]로 가리킨다. picks에는 그 번호만 넣는다.\n" +
  "3) **기본은 추천이다.** 기분·상황·주제·장르 중 하나라도 단서가 있으면(예: '위로', '가볍게', '소설', '과학') 되묻지 말고 바로 그 단서로 책을 골라 picks를 채운다. 학생은 추천받으러 왔으니 망설이지 말 것.\n" +
  "4) 되묻기는 입력이 정말 비어 있을 때만(예: '안녕', '추천해줘'처럼 단서 0개). 되물을 땐 picks 비우고 딱 한 가지만 짧게 묻는다.\n" +
  "5) 추천할 땐 message는 짧게(책 제목 길게 나열 금지 — 카드로 따로 보여준다), picks에 3~6권을 가장 잘 맞는 순서로 담는다.\n" +
  "6) 이전 대화 맥락(이미 추천한 책, 학생이 싫다고 한 것)을 기억해 반복하지 않는다.\n" +
  "7) 추천 후엔 자연스러운 후속 질문(더 가벼운/진지한, 소설/비소설 등)으로 대화를 이어간다.\n" +
  "8) 인사말·자기소개를 매번 반복하지 말 것. 첫 인사는 짧게 한 번이면 충분하고, 바로 책 이야기로 들어간다.\n" +
  "\n" +
  "[판단 예시]\n" +
  "- '가볍게 머리 식힐 소설 추천해줘' → 단서='가벼움+소설' 있음 → 되묻지 말고 즉시 picks 3~6권.\n" +
  "- '요즘 지쳐서 위로되는 책' → 단서='위로' 있음 → 즉시 picks.\n" +
  "- '과학책 없어요?' → 단서='과학' 있음 → 즉시 picks.\n" +
  "- '안녕' / '책 추천' (장르·기분 단서 0개) → picks 비우고 한 가지만 짧게 되묻기.\n\n" +
  "[도서 풀]\n";

// 들어온 메시지 정규화: role/content만, 너무 긴 히스토리는 최근 16개로 컷
function normMessages(raw: any[]): any[] {
  const arr = (raw || [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  const tail = arr.slice(-16);
  // Anthropic은 첫 메시지가 user여야 함
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { messages } = await req.json();
    const msgs = normMessages(messages);
    if (!msgs.length) return json({ error: "messages 비었음" }, 400);

    const pool = await getPool();
    const system = [
      { type: "text", text: PERSONA + pool.map(poolLine).join("\n"), cache_control: { type: "ephemeral" } },
    ];

    const out = (await claudeChat(system, msgs, REPLY_TOOL, 1200)) || { message: "잠깐 멍해졌네요. 다시 한 번 말씀해 주실래요?", picks: [] };
    const results = (out.picks || [])
      .map((p: any) => ({ ...(pool[p.id] || {}), reason: p.reason }))
      .filter((b: any) => b && b.isbn13);

    return json({ message: out.message || "", results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
