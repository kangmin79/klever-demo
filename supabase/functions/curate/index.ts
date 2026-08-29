// 북스타 — 사서 큐레이션 / 통합검색 후보 생성 (하이브리드 검색 코어)
// v8 (2026-06-26): 정밀도 우선 재설계. Haiku가 keywords(구체 핵심어) 추가 →
//   genre/topic/theme는 벡터+키워드 하이브리드 재정렬 + 유형별 정밀 게이트로만 채택.
//   ⛔제거: kdcPopular 인기서 패딩, theme의 구절/토큰 패딩 (off_topic 오염의 주원인).
//   recall은 줄지만(결과 8건 미만 허용) 무관 책 섞임을 차단. specific은 정확매칭 유지.
// v4 (2026-06-26): 의미검색(임베딩) 추가 + holdings 완전성 + 부제 생성.
//   ① 벡터: OpenAI 질의 임베딩 → match_book_pool RPC (book_pool.embedding, 의미 recall)
//   ② 기존 키워드: 제목/저자 ilike + 토큰 스코어 (특정 제목/저자)
//   ③ holdings 완전성: semyung_tulip ilike (신착·소장 특정책이 book_pool에 없어도 잡음) — P3 전환
//   ④ Haiku: 큐레이션 제목 + 부제 생성
// 입력: { query, onlyHeld?, genTitle?, holdings?, count?, format? }
//   - onlyHeld: 소장도서(종이∪전자)만 (사서 큐레이션) / 기본 false(=admin 통합검색 기존동작)
//   - format: 'ebook' | 'paper' | 'both'(기본) — 8/19 사서가 큐레이션 책 형태를 고름. 지정 시 onlyHeld 강제 + 그 형태만
//   - genTitle: 제목+부제 항상 생성 / holdings: semyung 완전성 추가
// 응답: { title, subtitle, params, count, candidates:[{title,author,publisher,year,isbn,kdc,loan,cover,smPaper..,smEbook..}] }
// 시크릿(env): CLAUDE_API_KEY, OPENAI_API_KEY (+ 자동주입 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

import { stockFromTable } from "../_shared/stock_table.ts";

const CLAUDE = Deno.env.get("CLAUDE_API_KEY")!;
const OPENAI = Deno.env.get("OPENAI_API_KEY") || "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";   // 제목·부제 카피라이팅 전용(품질↑) — 라우팅/검색은 Haiku 유지
const EMB_MODEL = "text-embedding-3-small";
const LIMIT_DEF = 24;
const SIM_CACHE = new Map<string, { t: number; body: any }>();   // similar 모드 결과 캐시(8/19 항상 추천 → 도서관 서버 재고 조회 절약)
const SIM_TTL = 10 * 60 * 1000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// AI 큐레이션(Sonnet 생성) 월 한도 — 초과 시 생성 차단(다음 달 자동 리셋, ym=년-월 키)
const MONTHLY_CAP = 500;
async function bumpAiUsage(ym: string): Promise<number> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/bump_ai_usage`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" },
    body: JSON.stringify({ p_ym: ym }),
  });
  return Number(await r.json()) || 0;
}

// --- Claude 툴 강제(구조화 출력) — 제목+부제 생성용 ---
async function claudeTool(system: string, user: string, tool: any, maxTokens = 320, model = MODEL) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature: 0, // 분류 비결정성 제거(동일질의=동일주제)
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [tool], tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await r.json();
  const tu = (data.content || []).find((c: any) => c.type === "tool_use");
  return tu?.input ?? null;
}

const TOPIC_TOOL = {
  name: "topic",
  description: "사서의 막연한 주제·분위기 문장을 도서 분류(KDC)·큐레이션 제목·학생용 부제로 변환",
  input_schema: {
    type: "object",
    properties: {
      queryType: { type: "string", description: "질의 의도 유형 하나만. specific=특정 제목·저자·책을 콕 집음(예 '82년생 김지영','조남주 책','Abundance'). genre=픽션 장르(소설·추리·SF·판타지·에세이·시). topic=비픽션 주제(과학·역사·경제·특정 학술주제). theme=감정·상황·분위기(위로·번아웃·새학기)." },
      kdc: { type: "string", description: "주제 대분류 한 자리(0총류 1철학 2종교 3사회과학 4자연과학 5기술과학 6예술 7언어 8문학 9역사). genre가 소설·추리·SF·시·에세이면 반드시 8. 비픽션 주제는 해당 분류. 애매하면 빈 문자열." },
      exactName: { type: "string", description: "specific일 때 찾는 핵심 제목 또는 저자명만(군더더기·오타 교정). 예 '아 82년 생 김지영'→'82년생 김지영', '조남주 책'→'조남주'. ⚠️외국 책·저자는 한국 정식 출간명(음역)으로: 'Factfulness'→'팩트풀니스', 'Nexus'(하라리)→'넥서스', 'Sapiens'→'사피엔스', 'Yuval Harari'→'유발 하라리'. specific 아니면 빈 문자열." },
      keywords: { type: "array", items: { type: "string" }, description: "이 질의에 적합한 책의 '제목'에 실제로 들어갈 법한 핵심어 2~5개. 질의의 구체적 하위주제를 콕 집은 명사 위주. 일반어(과학·역사·심리) 금지, 구체어만. ⚠️외국 제목·인명은 한국 출간명(음역)으로 변환해 넣어라(예 'Factfulness'→'팩트풀니스'). 예 'CRISPR 윤리'→['크리스퍼','유전자가위','생명윤리'], '양자역학 vs 고전역학'→['양자역학','고전역학','불확정성'], '외로울 때 위로'→['외로움','고독','위로']. 감정/상황 질의도 핵심 감정어를 넣어라." },
      title: { type: "string", description: "큐레이션 제목 한 줄. 짧고 감각적으로. 예: '마음이 무거운 날'" },
      subtitle: { type: "string", description: "학생에게 보일 1~2문장 설명(부제). 따뜻하고 구체적으로." },
      searchText: { type: "string", description: "의미검색(임베딩)용 풍부한 한국어 묘사 1~2문장. 질의의 '구체적 하위주제'를 좁고 정확하게 묘사. 넓은 분야로 일반화 금지(예 '양자역학 vs 고전역학'을 '과학 교양'으로 뭉뜽그리지 말 것). 짧은 단어 금지. 감정 질의는 '책·독서·에세이' 같은 메타단어 넣지 말고 감정·상황 자체를 묘사. 장르면 '소설/픽션' 명시. 예 'SF'→'우주·미래·외계를 다룬 SF 장편소설과 단편집, 과학적 상상력의 픽션'." },
    },
    required: ["queryType", "kdc", "keywords", "title", "subtitle", "searchText"],
  },
};
const TOPIC_SYS = "너는 대학 도서관 검색 라우터다. 질의를 받아 ① queryType(specific/genre/topic/theme) ② KDC 대분류 한 자리 ③ specific이면 핵심 제목·저자(exactName) ④ keywords(적합 책 제목에 들어갈 구체적 핵심어) ⑤ 큐레이션 제목 ⑥ 부제 ⑦ 의미검색용 묘사문(searchText)을 만든다. " +
  "문학=8, 역사=9, 철학=1, 종교=2, 사회과학=3, 자연과학=4, 기술과학=5, 예술=6, 언어=7, 총류=0. " +
  "⚠️중요: 소설·추리·SF·판타지·시·에세이 같은 픽션 장르는 genre+kdc 8. '책 한 권을 콕 집어 찾는' 느낌이면 specific. " +
  "keywords와 searchText는 질의의 '구체적 하위주제'를 좁게 잡아야 한다 — 넓은 분야로 일반화하면 엉뚱한 인기서가 섞인다. searchText에 장르면 '소설/픽션'을 명시하고, 감정 질의엔 '책·독서·에세이' 메타단어를 넣지 마라.";

// ── 오프토픽 게이트(전용·작은 호출) — 메인 분류와 병렬 실행해 지연 0. 7필드 분류에 묻으면 모델이 '책 만들기 모드'라
//    대부분 false로 합리화('파이썬 코드 짜줘'도 통과)해서, 단일 yes/no 전용 판정으로 분리(신뢰도↑).
const GATE_TOOL = {
  name: "gate",
  description: "입력이 책과 무관한(비도서) 질의인지 판정",
  input_schema: { type: "object", properties: {
    reject: { type: "boolean", description: "입력이 책 큐레이션 주제가 '전혀' 아니면 true, 책으로 추천 가능하면 false. 애매하면 false." },
  }, required: ["reject"] },
};
// ⚠️ 2026-07-02 라벨셋(20건) 튜닝 통과본. 감정질의를 '순간의 개인결정'으로 오분류해 거절하던 문제 해소.
//    핵심: 거절은 5종만 열거, 감정·이름조각(오타 포함)은 명시적으로 통과. 예시 과다·모호한 지시는 Haiku를 경계선으로 밀어 오거절 유발하므로 금지.
const GATE_SYS = "판정: 이 입력이 '책과 무관한 비도서 요청'인가. 오직 다음만 reject=true: ①단순 인사말(안녕·반가워) ②실시간 정보 요구(지금 몇 시·오늘 날씨) ③계산·코딩·번역 같은 도구 명령(1+1·파이썬 코드 짜줘) ④특정 장소·가게 추천(맛집·카페) ⑤뜻 없는 무작위 문자열, 즉 자음만 나열하거나 키보드를 마구 친 것(ㅁㄴㅇㄹ·asdfghjkl). " +
  "그 외에는 전부 reject=false로 통과한다. 특히 (a)모든 책 제목·저자·주제·학문·장르, (b)'지쳤어·위로받고 싶어·외로워·슬퍼·잠이 안 와' 같은 감정·기분·상황 표현, (c)사람 이름이나 작가명처럼 읽히는 짧은 말(오타·약칭 포함, 예: 하루끼·베베)은 그에 맞는 책을 추천할 수 있으므로 반드시 통과(false). 조금이라도 책으로 이어질 여지가 있으면 false.";
// 독립 fetch(plain system, cache_control 없음) — claudeTool 경유 시 엣지에서 reject 쏠림 현상 회피.
async function gateRejectRaw(query: string): Promise<any> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 40, temperature: 0,
      system: GATE_SYS,
      tools: [GATE_TOOL], tool_choice: { type: "tool", name: "gate" },
      messages: [{ role: "user", content: query }],
    }),
  });
  const data = await r.json();
  const tu = (data.content || []).find((c: any) => c.type === "tool_use");
  return tu?.input ?? null;
}

// ── 대화 모드(가벼움) — 사서 의도를 '최소 대화'로 빠르게 파악. Haiku 1콜(검색·생성 없음, 거의 무과금).
//    턴 제한 대신 '의도 수렴' 유도: 기본 ready=true, 정말 모호할 때만 질문 1개. 생성(8원)은 ready 후 1회만.
const CHAT_TOOL = {
  name: "chat",
  description: "사서와의 짧은 대화로 큐레이션 의도를 파악",
  input_schema: { type: "object", properties: {
    ready: { type: "boolean", description: "책을 고를 만큼 의도가 충분하면 true(기본). 정말 모호할 때만 false." },
    refinedTopic: { type: "string", description: "검색에 쓸 다듬어진 한 줄 주제(대화에서 드러난 주제·대상·분위기 종합). 예:'시험 스트레스로 지친 학생을 위한 가볍게 읽히는 위로 책'." },
    reply: { type: "string", description: "사서에게 보일 짧고 따뜻한 한마디. ready=true면 의도를 되짚는 '~로 골라볼게요' 류, false면 가장 결정적인 질문 하나." },
    chips: { type: "array", items: { type: "string" }, description: "ready=false일 때 빠른답변 칩 2~4개(아주 짧게). ready=true면 빈 배열." },
  }, required: ["ready", "refinedTopic", "reply", "chips"] },
};
const CHAT_SYS = "너는 대학 도서관 사서를 돕는 따뜻한 AI 큐레이션 파트너다. 목표는 '최소한의 대화로 사서의 의도를 빠르게 파악'해 바로 책을 골라주는 것. " +
  "원칙 ① 기본은 ready=true: 첫 입력만으로 책을 고를 수 있으면 즉시 ready=true, reply는 의도를 한 번 되짚어 확인하는 짧고 따뜻한 말(예 '시험 스트레스로 지친 학생들에게 위로가 되는 책으로 골라볼게요 🙂'). " +
  "② 정말 모호할 때만(예 '책' 한 단어, 또는 '위로인데 실용서'처럼 방향 충돌, 대상·분위기가 전혀 안 잡힘) ready=false 하고 가장 결정적인 질문 '하나'만 reply에, 선택지를 chips로. 한꺼번에 여러 개 묻지 마라. " +
  "③ 사서가 그 질문에 답하면 무조건 ready=true. 같은 걸 두 번 묻지 마라. " +
  "④ '더 가볍게'·'다른 분야로' 같은 조정 요청이 오면 직전 주제를 그 방향으로 바꿔 ready=true + refinedTopic 갱신. " +
  "⑤ refinedTopic은 대화에서 드러난 주제·대상·분위기를 자연스러운 한국어 한 줄로 합친다(과하게 길지 않게).";
async function chatTurn(messages: any[]) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 300, temperature: 0.4,
      system: [{ type: "text", text: CHAT_SYS, cache_control: { type: "ephemeral" } }],
      tools: [CHAT_TOOL], tool_choice: { type: "tool", name: "chat" },
      messages,
    }),
  });
  const data = await r.json();
  const tu = (data.content || []).find((c: any) => c.type === "tool_use");
  return tu?.input ?? null;
}

// 제목·부제 전용(Sonnet) — 실제 선정된 책 목록을 보고 카피라이팅. body.titleModel='sonnet'일 때만.
const TITLE_TOOL = {
  name: "curation",
  description: "주제와 실제로 선정된 도서 목록을 보고 큐레이션 제목·부제를 짓는다",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "큐레이션 제목 한 줄(12자 안팎). 짧고 감각적으로, 진부하지 않게. 책 제목을 그대로 베끼지 말고 책들을 관통하는 정서·맥락을 함축하라. 예: '마음이 무거운 날'" },
      subtitle: { type: "string", description: "학생에게 말 걸듯 따뜻하고 구체적인 1~2문장 부제." },
    },
    required: ["title", "subtitle"],
  },
};
const TITLE_SYS = "너는 대학 도서관 사서를 돕는 큐레이션 카피라이터다. 사서가 정한 주제와 실제로 골라진 책 목록을 보고, 그 책들을 한데 묶어줄 감각적이고 짧은 큐레이션 제목과 학생의 마음을 끄는 부제를 짓는다. 제목은 책 제목을 그대로 베끼지 말고 정서·맥락을 함축하라. 한국어로, 군더더기 없이.";

// 검색어 토큰화(코드 결정)
const STOP = new Set(["책", "도서", "추천", "관련", "입문", "찾아줘", "읽을", "읽기", "읽는", "읽은", "읽다", "좋은", "요즘", "최신",
  "위한", "대한", "있는", "없는", "그", "수", "것", "및", "또는", "내", "더", "좀", "처럼", "같은", "느낌", "필요할", "필요한", "때"]);
const sani = (s: string) => (s || "").replace(/[(),*%]/g, " ").replace(/\s+/g, " ").trim();
const tokenize = (raw: string) => [...new Set(raw.split(" ").filter((t) => t.length >= 2 && !STOP.has(t)))].slice(0, 5);
// 제목 정규화(중복제거 키). 부제 절단 + 끝의 권수(시리즈) 제거 → "학사전생. 1/2/10" 한 권으로 접음.
const normT = (s: string) => { const b = (s || "").split(/[:：(\/]/)[0].replace(/\s+/g, "").toLowerCase(); return b.replace(/\.?\d{1,3}(권|화)?$/, "") || b; };
// category("국내도서>인문학>심리학") → 주제어("인문학 심리학"). semyung kwHit/표시용.
const catWords = (c: string) => (c || "").replace(/^(국내도서|전자책|외국도서)>/, "").replace(/[>/]/g, " ").replace(/\s+/g, " ").trim();

// ── 크레마클럽(YES24 구독) 권당 조회 — enrich_semyung.mjs cremaCheck와 동일 로직(저자 정밀 검증) ──
// 표시 대상(큐레이션 노출) 책만 lazy로 확인 → semyung_tulip에 캐시(crema/crema_url/crema_checked_at, barcode 키).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const titleCore = (s: string) => (s || "").replace(/\[[^\]]*\]/g, "").split(/[:：]/)[0].replace(/[()（）\[\]]/g, "").replace(/[\s\-·,.'"’“”]/g, "").toLowerCase().trim();
const ogTitleOf = (h: string) => { const m = h.match(/property="og:title"\s+content="([^"]*)"/) || h.match(/content="([^"]*)"\s+property="og:title"/); return m ? m[1].replace(/\s*-\s*크레마클럽\s*$/, "").trim() : ""; };
const authorToks = (a: string) => (a || "").split(/[\s,·/()（）]+/).map((t) => titleCore(t)).filter((t) => t.length >= 2);
async function cremaCheck(title: string, author: string): Promise<{ cremaUrl: string } | null> {
  try {
    const r = await fetch(`https://cremaclub.yes24.com/BookClub/Search?query=${encodeURIComponent((title || "").split(/\s*[:\[(]/)[0].trim())}`, { headers: { "User-Agent": UA } });
    if (!r.ok) return null;
    const h = await r.text();
    const mine = titleCore(title), atoks = authorToks(author);
    const ids: string[] = []; let m: RegExpExecArray | null; const re = /BookClub\/Detail\/(\d+)"/g;
    while ((m = re.exec(h))) { if (!ids.includes(m[1])) ids.push(m[1]); if (ids.length >= 8) break; }
    for (const id of ids) {
      let dt = ""; try { const dr = await fetch(`https://cremaclub.yes24.com/BookClub/Detail/${id}`, { headers: { "User-Agent": UA } }); if (dr.ok) dt = ogTitleOf(await dr.text()); } catch (_) { /* skip */ }
      const tc = titleCore(dt); if (!tc) continue;
      if (tc === mine) return { cremaUrl: `https://cremaclub.yes24.com/BookClub/Detail/${id}` };
      if (tc.startsWith(mine)) { const extra = tc.slice(mine.length); if (atoks.length && atoks.some((a) => extra.includes(a))) return { cremaUrl: `https://cremaclub.yes24.com/BookClub/Detail/${id}` }; }
    }
    return null;
  } catch { return null; }
}
// 표시된 세명대 책 중 미검증(crema 캐시 null)만 권당 확인 → 후보에 crema 채우고 DB 캐시. 병렬·전체 타임아웃.
async function enrichCremaForDisplayed(cands: any[], timeoutMs = 4500) {
  const todo = cands.filter((c) => c.brcd && (c.crema === null || c.crema === undefined)).slice(0, 10);
  if (!todo.length) return;
  const one = async (c: any) => {
    const res = await cremaCheck(c.title, c.author || "");
    c.crema = !!res; c.cremaUrl = res ? res.cremaUrl : "";
    try {
      await fetch(`${SB_URL}/rest/v1/semyung_tulip?barcode=eq.${encodeURIComponent(c.brcd)}`, {
        method: "PATCH",
        headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ crema: !!res, crema_url: res ? res.cremaUrl : null, crema_checked_at: new Date().toISOString() }),
      });
    } catch (_) { /* 캐시 실패 무시 */ }
  };
  await Promise.race([
    Promise.allSettled(todo.map(one)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function rest(qs: string) {
  const r = await fetch(`${SB_URL}/rest/v1/book_pool?${qs}`, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } });
  return r.ok ? await r.json() : [];
}
// 국중(정보나루) 인기 대출수 조회 — 후보 isbn들의 loan_count 맵. 소장 큐레이션 인기 부스트·표시용.
async function bookPoolLoans(isbns: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(isbns.filter(Boolean))].slice(0, 300);
  if (!ids.length) return {};
  const rows = await rest(`select=isbn13,loan_count&isbn13=in.(${encodeURIComponent(ids.join(","))})&loan_count=not.is.null`);
  const m: Record<string, number> = {};
  for (const r of rows) if (r.isbn13) m[r.isbn13] = r.loan_count || 0;
  return m;
}
const SEL = "select=isbn13,title,author,publisher,pub_year,kdc_nm,kdc1,loan_count,cover,sm_paper,sm_paper_status,sm_paper_url,sm_ebook,sm_ebook_provider,sm_ebook_url,sm_ebook_brcd";

// 질의 임베딩 → 벡터 RPC (text는 호출부에서 풍부한 의미검색문으로 준비)
async function embedQuery(text: string): Promise<number[] | null> {
  if (!OPENAI || !text || !text.trim()) return null;
  try {
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST", headers: { Authorization: "Bearer " + OPENAI, "content-type": "application/json" },
      body: JSON.stringify({ model: EMB_MODEL, input: text }),
    });
    if (!r.ok) return null;
    return (await r.json()).data?.[0]?.embedding ?? null;
  } catch { return null; }
}
const SIM_FLOOR = 0.32; // 의미 유사도 하한 — 이하 약한 매칭은 패딩으로 안 넣음(정밀도 우선)
async function vectorMatch(emb: number[], count: number, onlyHeld: boolean, kdcFilter: string | null = null, floor = SIM_FLOOR) {
  // match_book_pool은 동시 부하 시 statement timeout(57014)을 종종 내므로 재시도 — 실패 시 []
  // (빈 결과는 호출부에서 인기서 패딩이 아니라 키워드 검색으로 보강됨)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/match_book_pool`, {
        method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" },
        body: JSON.stringify({ query_embedding: emb, match_count: count, only_held: onlyHeld, kdc_filter: kdcFilter }),
      });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; }
      const rows = await r.json();
      if (!Array.isArray(rows)) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; } // {code:57014...}
      return rows.filter((x: any) => (x.similarity ?? 1) >= floor);
    } catch { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); }
  }
  return [];
}

// 소장 큐레이션(onlyHeld) 전용: 세명대 전 장서(semyung_tulip, 전자책+종이책 임베딩 ~30만) 벡터검색 — P3 전환.
// 결과를 book_pool 후보 형태로 정규화 → 이후 GATE/dedup/toCand 파이프라인 그대로 재사용(저위험).
async function vectorMatchSemyung(emb: number[], count: number, floor = SIM_FLOOR, kindFilter: "ebook" | "paper" | null = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/rpc/match_tulip`, {
        method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" },
        body: JSON.stringify({ query_embedding: emb, match_count: count, kind_filter: kindFilter }),
      });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; }
      const rows = await r.json();
      if (!Array.isArray(rows)) { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); continue; }
      return rows.filter((x: any) => (x.similarity ?? 1) >= floor).map((b: any) => (b.kind === "paper" ? {
        // 종이책: 소장 링크만(라이브 대출상태는 모달의 semyung-holding 몫). brcd 비움 → 크레마 조회 제외.
        isbn13: b.isbn13 || ("cattot-" + b.brcd), brcd: "", title: b.title, author: b.author || "", publisher: b.publisher || "",
        pub_year: b.pub_year || "", kdc_nm: "", kdc1: "", loan_count: null, cover: b.cover || "",
        sm_paper: true, sm_paper_status: "소장", sm_paper_url: b.detail_url || "",
        sm_ebook: false, sm_ebook_provider: "", sm_ebook_url: "",
        crema: false, crema_url: "",
        similarity: b.similarity,
      } : {
        isbn13: b.isbn13 || ("sm-" + b.brcd), brcd: b.brcd, title: b.title, author: b.author || "", publisher: b.publisher || "",
        pub_year: b.pub_year || "", kdc_nm: "", kdc1: "", loan_count: null, cover: b.cover || "",
        sm_paper: false, sm_paper_status: "", sm_paper_url: "",
        sm_ebook: !!b.detail_url, sm_ebook_provider: b.provider || "", sm_ebook_url: b.detail_url || "",
        crema: b.crema, crema_url: b.crema_url || "",
        similarity: b.similarity,
      }));
    } catch { await new Promise((s) => setTimeout(s, 400 * (attempt + 1))); }
  }
  return [];
}

// 하이브리드: 질의 핵심어가 책 제목/저자/분류명에 박힌 개수 (벡터 점수에 가산)
const kwHit = (b: any, kws: string[]) => {
  if (!kws.length) return 0;
  const hay = ((b.title || "") + " " + (b.author || "") + " " + (b.kdc_nm || "")).toLowerCase();
  return kws.filter((k) => k && hay.includes(k)).length;
};
// 정밀 게이트(유형별): sim>=hard 이거나, 키워드 박혔고 sim>=soft 면 채택. kw=키워드당 점수 가산.
// 인기서 패딩(kdcPopular)·구절 패딩 제거 → recall은 줄지만 off_topic 오염 차단(정밀도 우선).
const GATE: Record<string, { hard: number; soft: number; kw: number }> = {
  genre: { hard: 0.40, soft: 0.34, kw: 0.06 },
  topic: { hard: 0.42, soft: 0.35, kw: 0.07 },
  theme: { hard: 0.42, soft: 0.36, kw: 0.06 },
};

const toCand = (b: any) => ({
  title: b.title, author: b.author || "", publisher: b.publisher || "",
  year: b.pub_year || "", isbn: b.isbn13, kdc: b.kdc_nm || "",
  loan: b.loan_count || null, cover: b.cover || "",
  smPaper: b.sm_paper === true, smPaperStatus: b.sm_paper_status || "", smPaperUrl: b.sm_paper_url || "",
  smEbook: b.sm_ebook === true, smEbookProvider: b.sm_ebook_provider || "", smEbookUrl: b.sm_ebook_url || "",
  // brcd: tulip 결과는 RPC가 주고, book_pool 결과는 sm_ebook_brcd(없으면 상세 URL의 brcd=)에서 — 없으면 재고 확인(즉시읽기 정렬)이 불가능해진다(8/18)
  brcd: b.brcd || b.sm_ebook_brcd || ((/[?&]brcd=([0-9A-Za-z]+)/.exec(String(b.sm_ebook_url || "")) || [, ""])[1]) || "",
  crema: b.crema === true ? true : (b.crema === false ? false : null), cremaUrl: b.crema_url || "",
});

// ── 리랭킹(검수): 검색된 실존 후보를 '원 질의 의도'와 다시 대조해 무관한 책을 떨군다.
//    환각 위험 없음(실존 후보를 점수매길 뿐 새 책 생성 X). searchText 표류로 게이트를 통과한 무관책을 컷.
//    measured A/B(60 균형샘플): 엄격통과 27%→58%(+31%p), 평균 rel 2.87→3.57, 회귀 0. 데이터천장 질의는 정직한 빈결과.
const RERANK_TOOL = {
  name: "rerank",
  description: "각 후보 도서가 학생 질의의 실제 의도에 부합하는지 0~3으로 채점",
  input_schema: {
    type: "object",
    properties: {
      scores: {
        type: "array", items: { type: "integer" },
        description: "입력 순서대로 각 책의 의도 충족도. 0=전혀무관 1=약간 2=관련(주제권) 3=정확히충족. 제목·저자·분류만 보고 판단. 후보 수와 정확히 같은 길이의 배열.",
      },
    },
    required: ["scores"],
  },
};
const RERANK_SYS = "너는 대학 도서관 추천 결과의 적합성 검수자다. 학생 질의의 '실제 의도'에 각 책이 부합하는지 제목·저자·분류만 보고 0~3으로 채점한다. " +
  "주제가 명백히 다르면 0~1(예: '데카르트 이원론'에 자기계발서, '양자장론'에 심리서 = 0), 같은 주제권이면 2, 핵심 의도를 정확히 충족하면 3. " +
  "목적은 검색이 잘못 끌어온 무관한 책을 솎아내는 것이다. 후하지도 박하지도 않게, 의심스러우면 낮게.";
// 후보를 원 질의로 재채점 → score>=2만 점수순. 전부 무관(<2)이면 [] (정직한 빈결과). 호출 실패 시 원본 유지.
async function rerankCandidates(query: string, cands: any[], minRel = 2): Promise<any[]> {
  if (cands.length < 2) return cands;
  const list = cands.map((b, i) => `${i + 1}. ${b.title} / ${b.author || "?"} (${b.kdc || ""})`).join("\n");
  const tp = await claudeTool(RERANK_SYS, `질의: "${query}"\n후보:\n${list}\n\n각 후보 점수 배열(입력 순서대로, ${cands.length}개).`, RERANK_TOOL, 500);
  const sc = tp?.scores;
  if (!Array.isArray(sc) || sc.length !== cands.length) return cands;  // 형식 어긋나면 안전하게 원본
  // rel(관련도 0~3)을 후보에 실어 보낸다. minRel 미만은 컷.
  //  - 학생용(minRel=2): 무관(0)·약함(1) 컷, 깐깐하게.
  //  - 사서 빌더(minRel=1): 사서가 최종 선별자라 후보를 넉넉히 — 완전무관(0)만 컷, 약한 건 플래그해서 보여줌.
  // 동일 관련도 안에서는 국중 인기(loan) 높은 책을 위로(주제적합 우선, 인기는 동점 보정).
  return cands.map((b, i) => ({ ...b, rel: Number(sc[i]) || 0 })).filter((x) => x.rel >= minRel)
    .sort((a, c) => c.rel - a.rel || (c.loan || 0) - (a.loan || 0));
}

// holdings 완전성: book_pool에 없어도 소장이면 잡음 (raw 구절 매칭) — P3에서 semyung_tulip 단일 조회로 전환
async function holdingsKeyword(raw: string) {
  if (raw.length < 2 || raw.length > 40) return [];
  const orB = encodeURIComponent(`title.ilike.*${raw}*,author.ilike.*${raw}*`);
  const hdr = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };
  const get = (u: string) => fetch(u, { headers: hdr }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const rows = await get(`${SB_URL}/rest/v1/semyung_tulip?select=ctrl,kind,barcode,isbn,title,author,cover_url,vendor&or=(${orB})&limit=24`);
  const out: any[] = [];
  for (const b of rows) {
    if (b.kind === "ebook") {
      const detail = b.barcode ? `https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd=${b.barcode}` : "";
      out.push({ title: b.title, author: b.author || "", publisher: "", year: "", isbn: b.isbn || ("sm-" + (b.barcode || b.ctrl)), kdc: "", loan: null, cover: b.cover_url || "", smPaper: false, smPaperStatus: "", smPaperUrl: "", smEbook: true, smEbookProvider: b.vendor || "", smEbookUrl: detail });
    } else {
      // 소장상태는 저장하지 않음(라이브 휘발) — 모달의 semyung-holding 라이브 조회가 담당
      out.push({ title: b.title, author: b.author || "", publisher: "", year: "", isbn: b.isbn || ("cattot-CATTOT" + b.ctrl), kdc: "", loan: null, cover: b.cover_url || "", smPaper: true, smPaperStatus: "소장", smPaperUrl: `https://lib.semyung.ac.kr/search/detail/CATTOT${b.ctrl}`, smEbook: false, smEbookProvider: "", smEbookUrl: "" });
    }
    if (out.length >= 24) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();

    // ── 전자책 대체 추천(2026-08-18 설계 v2, _추천설계_20260818.md) ──
    //   학생이 열려던 전자책이 전권 대출 중일 때 "같은 장르 · 인기 · 지금 바로 읽을 수 있는" want권(기본 3).
    //   울타리 = 그 책의 KDC(class_no) 접두 사다리(5자→3자→2자→1자). ⛔줄거리 임베딩 안 씀 — '급류'를 찾은 학생은
    //   "요즘 다들 읽는 소설"을 원한 것이지 강물 이야기를 원한 게 아니다(사용자 지적). 순서 = book_pool 국중 대출수 → 신착.
    //   재고는 우리 표(solsup_stock)에서만 읽는다(8/29 웹 긁기 0 — 예전엔 열 때마다 학교 화면을 최대 24권 긁었다).
    //   대출 중이거나 표에서 확인 안 되는 책은 대체재로 내밀지 않는다(available===true 이고 신선한 것만).
    if (body.similar && typeof body.similar === "object") {
      const t0 = Date.now();
      const want = Math.min(Math.max(Number(body.similar.count) || 3, 1), 6);
      const brcd = String(body.similar.brcd || "").replace(/[^0-9A-Za-z]/g, "");
      const ctrl = String(body.similar.ctrl || "").replace(/[^0-9A-Za-z]/g, "");   // 8/19: 종이책 제어번호(CATTOT 뒤 숫자) — 종이책 상세에서도 같은 장르 전자책 추천
      // 8/19 항상 추천(대출 가능일 때도) → 열 때마다 도서관 서버 재고를 찌르지 않도록 10분 캐시(아이솔레이트 메모리, 결과 있을 때만)
      const cacheKey = `${brcd}|${ctrl}|${want}|${String(body.similar.title || "").slice(0, 40)}`;
      const cached = SIM_CACHE.get(cacheKey);
      if (cached && Date.now() - cached.t < SIM_TTL) return json({ ...cached.body, cached: true, tookMs: Date.now() - t0 });
      const hdr = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "content-type": "application/json" };
      const get = (u: string) => fetch(u, { headers: hdr }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      // 시리즈·판본 대표 1권 키: 부제(:) 앞 본제목 → 권차(". 2", "v.3", "제2권", "(상)") 제거 → 공백·구두점 제거
      const seriesKey = (t: string) => String(t || "").replace(/\[[^\]]*\]/g, " ").split(/[:：=\/]/)[0]
        .replace(/\s*[\(（]?\s*(상|중|하|전|후)\s*[\)）]?\s*$/, "")
        .replace(/\s*(?:v\.|vol\.?|제)?\s*\d+\s*(?:권|부|편)?\s*$/i, "")
        .replace(/\s*[.．]\s*\d{1,2}\s+.*$/, "")   // 중간 권차 "설득의 심리학 . 2  Yes를…" → "설득의 심리학"
        .replace(/[\s\-·,.'"’“”()（）]/g, "").toLowerCase();
      let src: any = null;
      if (brcd) src = (await get(`${SB_URL}/rest/v1/semyung_tulip?select=ctrl,title,author,class_no,barcode&kind=eq.ebook&barcode=eq.${encodeURIComponent(brcd)}&limit=1`))[0] || null;
      if (!src && ctrl) src = (await get(`${SB_URL}/rest/v1/semyung_tulip?select=ctrl,title,author,class_no,barcode&kind=eq.paper&ctrl=eq.${encodeURIComponent(ctrl)}&limit=1`))[0] || null;
      if (!src && body.similar.title) {   // 바코드로 못 찾으면 제목 핵심부로 1회(구 바코드 형식 등)
        const core = sani(String(body.similar.title)).split(/\s*[:\-(\[]/)[0].trim();
        if (core.length >= 2) src = (await get(`${SB_URL}/rest/v1/semyung_tulip?select=ctrl,title,author,class_no,barcode&kind=eq.ebook&title=ilike.*${encodeURIComponent(core)}*&limit=1`))[0] || null;
      }
      if (!src || !src.class_no) return json({ similar: true, count: 0, candidates: [], reason: "no_source", tookMs: Date.now() - t0 });
      const cls = String(src.class_no).trim();
      const ladder = [...new Set([cls.slice(0, 5), cls.slice(0, 3), cls.slice(0, 2), cls.slice(0, 1)].map((s) => s.replace(/\.$/, "")).filter(Boolean))];
      const rpc = (prefix: string, lim: number) => fetch(`${SB_URL}/rest/v1/rpc/similar_ebooks`, { method: "POST", headers: hdr, body: JSON.stringify({ class_prefix: prefix, exclude_brcd: src.barcode || brcd, lim }) })
        .then((r) => (r.ok ? r.json() : [])).catch(() => []);
      const pool: any[] = []; const seenK = new Set<string>([seriesKey(src.title)]); const used: string[] = [];
      for (const p of ladder) {
        const rows = await rpc(p, 80);
        used.push(`${p}:${Array.isArray(rows) ? rows.length : 0}`);
        for (const r of (Array.isArray(rows) ? rows : [])) { const k = seriesKey(r.title); if (!k || seenK.has(k)) continue; seenK.add(k); pool.push(r); }
        if (pool.length >= 24) break;   // 후보가 충분하면 울타리를 더 넓히지 않는다(장르가 흐려짐)
      }
      // 재고 확인 — 표에서 한 번에(학교 호출 0). 인기 순서 그대로 훑어 want권 찰 때까지.
      const picked: { b: any; s: any }[] = [];
      const cand = pool.slice(0, 24);
      const tr = await stockFromTable(cand.map((b) => String(b.brcd)));
      const checked = cand.length;
      for (const b of cand) { const s = tr.map.get(String(b.brcd)); if (s && s.available) { picked.push({ b, s }); if (picked.length >= want) break; } }
      const stockMeta = { source: "table", found: tr.found, fresh: tr.fresh, stale: tr.stale, missing: tr.missing, error: tr.error };
      const cleanTitle = (t: string) => String(t || "").replace(/\s*\/\s*$/, "").replace(/\s{2,}/g, " ").trim();
      const candidates = picked.map(({ b, s }) => ({
        title: cleanTitle(b.title), author: b.author || "", publisher: b.publisher || "", year: b.pub_year || "",
        isbn: "sm-" + b.brcd, kdc: b.class_no || "", loan: b.loan_count || null, cover: b.cover || "",
        smPaper: false, smPaperStatus: "", smPaperUrl: "",
        smEbook: true, smEbookProvider: b.vendor || "", smEbookUrl: `https://ebook.semyung.ac.kr/elibrary-front/content/contentView.ink?cttsDvsnCode=001&lbryCode=20213&brcd=${b.brcd}`,
        brcd: String(b.brcd), crema: false, cremaUrl: "", _avail: true, _stock: { loaned: s.loaned, total: s.total }, _source: "similar", _kind: "ebook",
      }));
      const out = { similar: true, count: candidates.length, candidates,
        source: { brcd: src.barcode || brcd, title: cleanTitle(src.title), class_no: cls }, ladder: used, pool: pool.length, checked, stock: stockMeta };
      if (candidates.length) { if (SIM_CACHE.size > 500) SIM_CACHE.clear(); SIM_CACHE.set(cacheKey, { t: Date.now(), body: out }); }
      return json({ ...out, tookMs: Date.now() - t0 });
    }

    const query = body.query;
    if (!query || !query.trim()) return json({ error: "query 비었음" }, 400);
    if (String(query).length > 400) return json({ error: "질문이 너무 길어요 (400자 이내)" }, 400);   // 8/29 비용 상한

    // ── 대화 모드 — 의도 파악만(검색·생성 없음). 오프토픽이면 정중히. 거의 무과금(Haiku 1콜).
    if (body.chat === true) {
      const msgs = (Array.isArray(body.messages) && body.messages.length)
        ? body.messages.filter((m: any) => m && m.content).slice(-6).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 500) }))
        : [{ role: "user", content: query }];
      const lastUser = [...msgs].reverse().find((m: any) => m.role === "user")?.content || query;
      const g = await gateRejectRaw(lastUser).catch(() => null);
      if (g?.reject === true) {
        return json({ chat: true, ready: false, offtopic: true, chips: [],
          reply: "저는 도서관 책 큐레이션을 도와드려요 📚 어떤 주제·분위기·대상의 책이 필요하세요?" });
      }
      const t = await chatTurn(msgs).catch(() => null);
      if (!t) return json({ chat: true, ready: true, reply: "좋아요, 골라볼게요 ✨", refinedTopic: lastUser, chips: [] });
      return json({ chat: true, ready: t.ready !== false, reply: String(t.reply || "좋아요, 골라볼게요 ✨"),
        refinedTopic: String(t.refinedTopic || lastUser), chips: Array.isArray(t.chips) ? t.chips.slice(0, 4).map((c: any) => String(c)) : [] });
    }

    // ── 고전 풀 모드(8/14 사장님 수정요청) — 클라이언트가 준 후보 풀(북스타 고전 185+110권)에서만 고른다.
    //    DB 의미검색 없음: 목록이 작아 LLM이 통째로 보고 고르는 편이 정확. 세계고전·한국고전 관리자 AI 큐레이션용.
    if (Array.isArray(body.pool) && body.pool.length) {
      const gateOk = await (async () => { try { const g = await gateRejectRaw(query); return g?.reject !== true; } catch { return true; } })();
      if (!gateOk) {
        return json({ offtopic: true, count: 0, candidates: [], title: "", subtitle: "",
          message: "책 큐레이션 주제를 적어주세요. 예: '사랑과 성장', '가볍게 읽는 희곡', '방학에 읽는 장편'." });
      }
      let monthCount = 0;
      if (body.titleModel === "sonnet") {   // 소장 큐레이션과 동일한 월 한도 계정
        try { monthCount = await bumpAiUsage(new Date().toISOString().slice(0, 7)); } catch (_) { monthCount = 0; }
        if (monthCount > MONTHLY_CAP) {
          return json({ limited: true, monthCount, cap: MONTHLY_CAP,
            error: `이번 달 AI 큐레이션 생성 한도(${MONTHLY_CAP}회)에 도달했어요. 다음 달 1일에 자동으로 초기화됩니다.` });
        }
      }
      const pool = body.pool.slice(0, 400)
        .map((b: any) => ({ id: String(b.id || ""), title: String(b.title || "").slice(0, 80), author: String(b.author || "").slice(0, 40), cover: String(b.cover || "").slice(0, 200) }))
        .filter((b: any) => b.id && b.title);
      const want = Math.min(Math.max(Number(body.count) || 12, 1), 30);
      const listTxt = pool.map((b: any, i: number) => `${i}. ${b.title}${b.author ? " / " + b.author : ""}`).join("\n");
      const PICK_TOOL = { name: "pick_books", description: "주제에 맞는 책을 목록 번호로 고른다",
        input_schema: { type: "object", properties: {
          picks: { type: "array", items: { type: "object", properties: {
            i: { type: "number", description: "목록 번호" },
            rel: { type: "number", description: "3=딱 맞음, 2=주제권, 1=약간만 관련" } }, required: ["i"] } } }, required: ["picks"] } };
      const PICK_SYS = "너는 대학도서관 사서다. 학생 큐레이션 주제에 맞는 책을 아래 고전 목록에서만 고른다. 확실히 맞는 책 위주로, 관련이 약하면 rel=1로 표시. 맞는 책이 없으면 빈 배열.";
      let picks: any[] = [];
      try {
        const pk = await claudeTool(PICK_SYS, `주제: ${query}\n최대 ${want}권 고르기.\n목록:\n${listTxt}`, PICK_TOOL, 1400,
          body.titleModel === "sonnet" ? SONNET : undefined as any);
        picks = Array.isArray(pk?.picks) ? pk.picks : [];
      } catch (_) { picks = []; }
      const pseen = new Set<number>();
      const candidates: any[] = [];
      for (const p of picks) {
        const i = Number(p?.i);
        if (!Number.isInteger(i) || i < 0 || i >= pool.length || pseen.has(i)) continue;
        pseen.add(i);
        const b = pool[i];
        candidates.push({ id: b.id, title: b.title, author: b.author, cover: b.cover || undefined, cls: true,
          rel: (p.rel === 1 || p.rel === 2 || p.rel === 3) ? p.rel : 3 });
        if (candidates.length >= want + 6) break;
      }
      let outTitle = sani(query).slice(0, 24), outSub = "";
      if (body.genTitle === true && candidates.length) {
        try {
          const booklist = candidates.slice(0, 8).map((c: any) => `- ${c.title}${c.author ? " / " + c.author : ""}`).join("\n");
          const tp = await claudeTool(TITLE_SYS, `주제: ${query}\n선정된 책:\n${booklist}`, TITLE_TOOL, 240,
            body.titleModel === "sonnet" ? SONNET : undefined as any);
          if (tp?.title && String(tp.title).trim()) outTitle = String(tp.title).trim();
          if (tp?.subtitle && String(tp.subtitle).trim()) outSub = String(tp.subtitle).trim();
        } catch (_) { /* 제목 실패 → 주제 그대로 */ }
      }
      return json({ title: outTitle, subtitle: outSub, count: candidates.length, candidates, monthCount, poolMode: true });
    }

    // 8/19 책 형태 선택(사서 큐레이션 전부): 'ebook' | 'paper' | 'both'(기본). 형태를 고르면 소장도서 안에서만 찾는다(형태=소장의 부분집합).
    const format: "ebook" | "paper" | "both" = (body.format === "ebook" || body.format === "paper") ? body.format : "both";
    const onlyHeld = body.onlyHeld === true || format !== "both";
    const genTitle = body.genTitle === true;
    const withHoldings = body.holdings === true;
    // (월 한도 과금은 오프토픽 판정 통과 후로 이동 — 비도서 질의엔 카운트·검색 안 함)
    const LIMIT = Math.min(Math.max(Number(body.count) || LIMIT_DEF, 1), 40);
    const raw = sani(query);
    const tokens = tokenize(raw);

    const seen = new Set<string>();
    const out: any[] = [];
    let degraded = false;   // 벡터검색이 죽어(임베딩 실패·timeout) 키워드로만 검색된 상태 — 관찰성용(동작 변화 없음)
    const heldOk = (b: any) => !onlyHeld ? true
      : format === "ebook" ? b.sm_ebook === true
      : format === "paper" ? b.sm_paper === true
      : (b.sm_paper === true || b.sm_ebook === true);
    // 같은 책(isbn13)이 종이·전자 두 행으로 오면 대표 1건에 형태를 합친다(8/18) — 안 그러면 먼저 온 종이 행이 전자책을 가려
    //   "바로 읽기"가 사라지고, 즉시읽기 정렬(byeoli-search)이 재고를 확인할 brcd도 못 받는다.
    const mergeSm = (ex: any, b: any) => {
      if (b.sm_ebook && !ex.sm_ebook) { ex.sm_ebook = true; ex.sm_ebook_url = b.sm_ebook_url || ex.sm_ebook_url; ex.sm_ebook_provider = b.sm_ebook_provider || ex.sm_ebook_provider; }
      if (b.sm_paper && !ex.sm_paper) { ex.sm_paper = true; ex.sm_paper_url = b.sm_paper_url || ex.sm_paper_url; ex.sm_paper_status = b.sm_paper_status || ex.sm_paper_status; }
      if (!ex.brcd && (b.brcd || b.sm_ebook_brcd)) ex.brcd = b.brcd || b.sm_ebook_brcd;
      if (!ex.cover && b.cover) ex.cover = b.cover;
      if ((ex.loan_count == null) && b.loan_count != null) ex.loan_count = b.loan_count;
    };
    const push = (rows: any[]) => {
      for (const b of rows) {
        if (!b.isbn13 || !heldOk(b)) continue;
        if (seen.has(b.isbn13)) { const ex = out.find((x) => x.isbn13 === b.isbn13); if (ex) mergeSm(ex, b); continue; }
        seen.add(b.isbn13); out.push(b);
      }
    };

    // 검색 층 정의
    const doPhrase = async () => {  // 구절 매칭(특정 제목/저자)
      if (raw.length < 2 || raw.length > 40) return;
      const ors = `title.ilike.*${raw}*,author.ilike.*${raw}*`;
      push(await rest(`${SEL}&or=(${encodeURIComponent(ors)})&order=loan_count.desc&limit=${LIMIT}`));
    };
    const doToken = async () => {  // 토큰 다중 매칭(다단어 특정 검색)
      if (!tokens.length) return;
      const ors = tokens.flatMap((t) => [`title.ilike.*${t}*`, `author.ilike.*${t}*`]).join(",");
      const cand = await rest(`${SEL}&or=(${encodeURIComponent(ors)})&order=loan_count.desc&limit=80`);
      const minScore = tokens.length >= 2 ? 2 : 1;
      const scored = cand.map((b: any) => ({ b, s: tokens.filter((t) => (b.title + " " + (b.author || "")).includes(t)).length }))
        .filter((x: any) => x.s >= minScore)
        .sort((a: any, c: any) => c.s - a.s || (c.b.loan_count || 0) - (a.b.loan_count || 0));
      push(scored.map((x: any) => x.b));
    };
    const doVector = async (emb: number[] | null, kdcF: string | null = null, floor = SIM_FLOOR) => { if (emb) push(await vectorMatch(emb, LIMIT * 3, onlyHeld, kdcF, floor)); };
    // 최후 보강: 인기 베스트셀러 패딩 대신 핵심어 ilike 검색(주제 이탈 방지)
    const keywordRest = async (terms: string[]) => {
      const t = terms.filter((x) => x && x.length >= 2).slice(0, 5);
      if (!t.length) return;
      const ors = t.flatMap((k) => [`title.ilike.*${k}*`, `author.ilike.*${k}*`]).join(",");
      push(await rest(`${SEL}&or=(${encodeURIComponent(ors)})&order=loan_count.desc&limit=${LIMIT}`));
    };

    // ⏱️ 지연 계측(임시) — 단계별 ms를 params.timing으로 반환해 병목 식별.
    const _T: Record<string, number> = {}; const _s0 = Date.now(); let _tk = _s0;
    const _lap = (k: string) => { const now = Date.now(); _T[k] = now - _tk; _tk = now; };
    // 항상 의도 분류(라우팅) + 오프토픽 게이트를 병렬 실행(지연 0). 게이트가 비도서면 검색·과금 없이 종료.
    const [gate, p] = await Promise.all([
      (async () => { try { const g = await gateRejectRaw(query); return g?.reject !== true; } catch { return true; } })(),
      claudeTool(TOPIC_SYS, query, TOPIC_TOOL),
    ]);
    _lap("route");   // gate+topic 병렬
    // 오프토픽('오늘 뭐 먹지?' 같은 비도서 질의) → 검색·과금 없이 정중히 종료.
    //   ⚠️ Haiku 게이트가 간헐 오거절해도 별이(byeoli-search)는 keyword/find 결과가 있으면 offtopic을 뒤집어 보정한다.
    if (!gate) {
      return json({ offtopic: true, count: 0, candidates: [], title: "", subtitle: "",
        message: "책 큐레이션 주제를 적어주세요. 예: '시험 스트레스에 지친 마음', '여름에 읽는 추리소설', '진로 고민'." });
    }
    // AI 큐레이션(Sonnet 생성)만 월 한도 — 오프토픽 통과 후에만 과금(빠른검색·일반은 무제한)
    if (body.titleModel === "sonnet") {
      let n = 0;
      try { n = await bumpAiUsage(new Date().toISOString().slice(0, 7)); } catch (_) { n = 0; }  // 카운터 오류 시 막지 않음(fail-open)
      if (n > MONTHLY_CAP) {
        return json({ limited: true, monthCount: n, cap: MONTHLY_CAP,
          error: `이번 달 AI 큐레이션 생성 한도(${MONTHLY_CAP}회)에 도달했어요. 다음 달 1일에 자동으로 초기화됩니다.` });
      }
    }
    const qtype = String(p?.queryType || "theme").toLowerCase();
    const kdc = p && /^[0-9]$/.test(String(p.kdc)) ? String(p.kdc) : "";
    const exactName = (p?.exactName || "").trim();
    const stext = (p?.searchText && p.searchText.trim()) ? p.searchText : query;
    const kws: string[] = Array.isArray(p?.keywords)
      ? p.keywords.map((k: any) => String(k || "").trim().toLowerCase()).filter((k: string) => k.length >= 2).slice(0, 6)
      : [];
    const curTitle = (p?.title && p.title.trim()) ? p.title : raw.slice(0, 24);
    const curSub = p?.subtitle || "";

    if (qtype === "specific") {
      // 특정 제목/저자 — 정확 매칭만(패딩 금지, 정밀도 우선)
      if (exactName) {
        const ex = sani(exactName);
        const ors = `title.ilike.*${ex}*,author.ilike.*${ex}*`;
        push(await rest(`${SEL}&or=(${encodeURIComponent(ors)})&order=loan_count.desc&limit=${LIMIT}`));
      }
      await doPhrase();
      await doToken();
      // 정확 매칭이 전혀 없을 때만 의미검색 최후보강(높은 하한)
      if (out.length === 0) await doVector(await embedQuery(stext), null, 0.42);
    } else {
      // genre/topic/theme — 하이브리드(벡터+키워드) 재정렬 + 정밀 게이트, 인기서·구절 패딩 없음
      const gate = GATE[qtype] || GATE.theme;
      const embText = stext + (kws.length ? " (" + kws.join(", ") + ")" : ""); // 하위주제 앵커
      const emb = await embedQuery(embText);
      _lap("embed");
      if (!emb) degraded = true;   // 임베딩 실패 → 키워드 폴백
      let rows: any[] = [];
      if (emb) {
        if (onlyHeld) {
          // 소장 큐레이션 = 세명대 전체 장서(23,727) 의미검색. book_pool(인기 9,887) 천장 해소.
          rows = await vectorMatchSemyung(emb, LIMIT * 4, 0, format === "both" ? null : format);   // 형태 지정 시 RPC 부분 인덱스(kind_filter)로 바로 좁힘
        } else {
          const kdcF = (qtype === "genre" && kdc) ? kdc : null; // genre만 KDC 하드필터(문학 등)
          rows = await vectorMatch(emb, LIMIT * 4, onlyHeld, kdcF, 0);
          if (qtype === "genre" && rows.length < LIMIT) rows = rows.concat(await vectorMatch(emb, LIMIT * 4, onlyHeld, null, 0));
        }
        if (rows.length === 0) degraded = true;   // 벡터 timeout(3회 재시도 실패) 또는 의미 무매칭 → 키워드 의존
      }
      _lap("vector");
      const seenV = new Set<string>();
      const scored: { b: any; score: number }[] = [];
      const passed: any[] = [];
      const byIsbn = new Map<string, any>();
      for (const b of rows) {
        if (!b.isbn13 || !heldOk(b)) continue;
        if (seenV.has(b.isbn13)) { const ex = byIsbn.get(b.isbn13); if (ex) mergeSm(ex, b); continue; }   // 종이·전자 같은 책 → 형태 병합
        seenV.add(b.isbn13); byIsbn.set(b.isbn13, b);
        const sim = b.similarity ?? 0;
        const hits = kwHit(b, kws);
        if (sim >= gate.hard || (hits >= 1 && sim >= gate.soft)) scored.push({ b, score: sim + gate.kw * hits });
        else passed.push(b); // 게이트 탈락(주제권 안이지만 약한 매칭) — 최후 graceful 보강용
      }
      // 국중 인기도서 매칭(소장 큐레이션) — book_pool 대출수로 '검증된 인기' 부스트. 주제적합이 1순위라 가산은 작게(하드필터 X).
      if (onlyHeld && scored.length) {
        try {
          const loanMap = await bookPoolLoans(scored.map((x) => x.b.isbn13));
          for (const x of scored) {
            const ln = loanMap[x.b.isbn13] || 0;
            if (ln > 0) { x.b.loan_count = ln; x.score += 0.03 + Math.min(0.10, Math.log10(ln + 1) * 0.025); } // 인기 부스트(상한 +0.13)
          }
        } catch (_) { /* 인기 조회 실패는 무시(부스트만 생략) */ }
      }
      scored.sort((a, c) => c.score - a.score);
      push(scored.map((x) => x.b));
      // 게이트가 전부 걸러도 인기 베스트셀러(소설 등)로 패딩하지 않는다 —
      // 같은 의미공간의 상위 유사도 책으로만 소수 보강(주제 이탈 방지).
      // ⚠️ 단 '질의 키워드를 실제로 공유'하고 SIM_FLOOR(0.32) 이상인 책만 구제한다(2026-06-27).
      //    좁은 주제(예 '양자장론 재규격화')는 세명대에 진짜 매칭이 없고 임베딩 노이즈(무관책 0.3~0.4)뿐이라
      //    유사도 하한만으론 못 거른다 → 키워드 공유로 '주제권' 확증. 없으면 정직하게 0건(억지 패딩 금지).
      if (!out.length) push(passed.filter((b) => kwHit(b, kws) >= 1 && (b.similarity ?? 0) >= SIM_FLOOR).slice(0, 5));
    }
    // 결과 전무 시(벡터 timeout·임베딩 실패 등) 최후 보강 = 핵심어 검색(인기 베스트셀러 패딩 금지)
    if (!out.length) { degraded = true; await keywordRest(kws.length ? kws : tokens); }   // 본 검색 전무 → 키워드 최후보강
    if (!out.length) await keywordRest(exactName ? [exactName] : tokens);

    // 후보 빌드 — 제목 기준 중복제거(같은 책 다른 판본 ISBN 방지)
    const titleSeen = new Set<string>();
    const candidates: any[] = [];
    // 제목이 같은 다른 판본(예: 종이 isbn 있음 + 전자 isbn 없음)은 대표 1건에 형태를 합친다 — 저자 첫 토큰까지 같을 때만(동명이서 과병합 방지)
    const authKey = (a: string) => String(a || "").split(/[,\s;/]+/)[0].replace(/[^가-힣a-z0-9]/gi, "").toLowerCase();
    const mergeCand = (ex: any, b: any) => {
      if (b.sm_ebook && !ex.smEbook) { ex.smEbook = true; ex.smEbookUrl = b.sm_ebook_url || ""; ex.smEbookProvider = b.sm_ebook_provider || ""; }
      if (b.sm_paper && !ex.smPaper) { ex.smPaper = true; ex.smPaperUrl = b.sm_paper_url || ""; ex.smPaperStatus = b.sm_paper_status || ""; }
      const bb = b.brcd || b.sm_ebook_brcd || ((/[?&]brcd=([0-9A-Za-z]+)/.exec(String(b.sm_ebook_url || "")) || [, ""])[1]);
      if (!ex.brcd && bb) ex.brcd = bb;
      if (!ex.cover && b.cover) ex.cover = b.cover;
      if (ex.loan == null && b.loan_count != null) ex.loan = b.loan_count;
    };
    for (const b of out) {
      const nt = normT(b.title);
      if (titleSeen.has(nt)) { const ex = candidates.find((c: any) => normT(c.title) === nt && authKey(c.author) === authKey(b.author)); if (ex) mergeCand(ex, b); continue; }
      titleSeen.add(nt); candidates.push(toCand(b));
      if (candidates.length >= LIMIT) break;
    }

    // 6) holdings 완전성(신착·특정 소장책) — book_pool에 없어도 추가
    if (withHoldings) {
      const hq = (qtype === "specific" && exactName) ? exactName : raw;
      for (const c of await holdingsKeyword(hq)) {
        const nt = normT(c.title);
        if (seen.has(c.isbn) || titleSeen.has(nt)) continue;
        titleSeen.add(nt); candidates.push(c);
        if (candidates.length >= LIMIT + 12) break;
      }
    }
    // 형태 선택 최종 안전망 — 어떤 경로(holdings·키워드 최후보강)로 왔든 고른 형태가 아닌 책은 내지 않는다
    if (format !== "both") {
      const kept = candidates.filter((c: any) => format === "ebook" ? c.smEbook === true : c.smPaper === true);
      candidates.length = 0; candidates.push(...kept);
    }

    // 리랭킹(선택): 검색된 후보를 원 질의로 재검수해 무관책 컷 + 정밀순 재정렬. 제목생성·크레마 앞에 둬서
    //   제목은 리랭크된 세트로 짓고, 크레마도 살아남은 책만 조회. 전부 무관이면 빈 결과(정직).
    if (body.rerank === true && candidates.length >= 2) {
      try {
        // 사서 큐레이션(onlyHeld)은 후보를 넉넉히(완전무관만 컷) — 사서가 약한 매칭은 플래그 보고 직접 선별.
        const rr = await rerankCandidates(query, candidates, onlyHeld ? 1 : 2);
        candidates.length = 0; candidates.push(...rr);
      } catch (_) { /* 리랭크 실패 → 원본 유지(이미 candidates 그대로) */ }
    }

    // 제목·부제 카피라이팅을 Sonnet으로 격상(선택) — 실제 선정 도서를 보고 다시 지음. 실패 시 Haiku 제목 유지.
    let outTitle = curTitle, outSub = curSub;
    if (body.titleModel === "sonnet" && candidates.length) {
      try {
        const booklist = candidates.slice(0, 8).map((c: any) => `- ${c.title}${c.author ? " / " + c.author : ""}`).join("\n");
        const tp = await claudeTool(TITLE_SYS, `주제: ${query}\n선정된 책:\n${booklist}`, TITLE_TOOL, 240, SONNET);
        if (tp?.title && String(tp.title).trim()) outTitle = String(tp.title).trim();
        if (tp?.subtitle && String(tp.subtitle).trim()) outSub = String(tp.subtitle).trim();
      } catch (_) { /* Sonnet 실패 → Haiku 제목 유지 */ }
    }
    // 구독(크레마) 표시 — 소장 큐레이션에 노출되는 세명대 책 중 미검증분만 권당 조회·캐시(표시 대상만, 캐시되면 즉시).
    //   skipCrema(별이 통합검색 융합 호출): 라이브 크레마 조회(최대 4.5s)를 건너뛴다. 캐시된 crema 값은 toCand가 이미 실어 표시됨.
    // 8/14 사장님 지시: 구독(크레마) 연동 전면 중단 — 크레마클럽 전체 데이터를 정식으로 받으면 그때 제대로 적재.
    // 그때까지 라이브 조회·semyung_tulip 캐시 적재 금지(아래 한 줄 복원하면 재개).
    // if (onlyHeld && body.skipCrema !== true) { try { await enrichCremaForDisplayed(candidates); } catch (_) { /* 크레마 조회 실패는 결과에 영향 없음 */ } }
    _lap("post"); _T.total = Date.now() - _s0;
    return json({ title: outTitle, subtitle: outSub, queryType: qtype, params: { tokens, degraded, timing: _T }, count: candidates.length, candidates });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
