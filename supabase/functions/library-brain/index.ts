// 북스타 '별이' = 세명대 도서관 두뇌 (대화 라우터 + 운영정보 답변)
// 입력: { messages:[{role,content}], query? }  (query 없으면 messages 마지막 user)
// 한 번의 Haiku 호출로: ① 의도분류(info/books/other) ② info면 KB 기반 답변 ③ books면 추천 준비(ready/refinedTopic/chips)
//   - info: 운영시간·연락처·시설·규정·신청법 등 → 도서관 지식베이스(kb.ts, 실데이터)에서 정확히 답
//   - books: 책/자료/논문 찾기·추천 → 클라이언트가 curate로 라우팅(ready+refinedTopic 전달)
//   - other: 인사·잡담·비도서 → 별이가 할 수 있는 일로 짧게 안내
// 시크릿(env): CLAUDE_API_KEY
import { SEMYUNG_KB } from "./kb.ts";

const CLAUDE = Deno.env.get("CLAUDE_API_KEY")!;
const MODEL = "claude-haiku-4-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const BRAIN_TOOL = {
  name: "brain",
  description: "학생의 메시지를 분류하고, 도서관 운영정보면 답하고, 책 요청이면 추천 준비를 한다",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["info", "books", "other"],
        description: "info=도서관 운영/이용/시설/연락처/규정/신청 등 안내 질문. books=책·자료·논문 찾기 또는 추천. other=인사·잡담·도서관과 무관.",
      },
      reply: {
        type: "string",
        description: "학생에게 보여줄 한국어 답변/한마디. ⚠️info는 절대 길게 나열하지 말 것 — 핵심만 2~4문장(또는 불릿 최대 3개)으로 요약하고, 자세한 규정·목록·절차는 link로 넘긴다(전부 옮겨적기 금지). ⚠️**reply 끝에 '자세한 내용은 아래 링크에서/링크를 참고하세요' 같은 안내 문구를 절대 붙이지 마라 — 링크 버튼이 자동으로 따로 표시되니 중복이고 지저분하다. 답만 깔끔히 끝낸다.** 없는 정보는 '확인이 어렵다'며 도서관(043-649-7009) 안내, 지어내지 말 것. books이고 ready=false면 가장 결정적인 질문 하나. books이고 ready=true면 의도를 되짚는 짧은 확인. other면 별이가 도울 수 있는 걸 한 문장으로.",
      },
      link: {
        type: "string",
        description: "intent=info일 때, 그 주제의 자세한 내용이 있는 도서관 페이지 URL. [지식베이스] 각 섹션의 '(출처링크: ...)'에 적힌 URL을 그대로 복사(지어내지 말 것). 해당 링크가 없으면 빈 문자열.",
      },
      linkLabel: {
        type: "string",
        description: "link 버튼에 보일 짧은 라벨(예 '독서인증제 안내', '시설 이용 안내'). link 있을 때만.",
      },
      ready: {
        type: "boolean",
        description: "intent=books일 때만. 책을 고를 만큼 의도가 충분하면 true(기본), 정말 모호하면 false.",
      },
      refinedTopic: {
        type: "string",
        description: "intent=books이고 ready=true일 때 도서관 목록에 그대로 넣을 검색어. " +
          "⚠️학생이 책 제목·저자·특정 낱말을 댔으면 **그 말을 글자 그대로** 넣어라. 장르·저자·설명·부연을 절대 덧붙이지 마라. " +
          "(반례: '오디세이'→'오디세이 - 고전 서사시' ✗, '데미안'→'헤르만 헤세의 데미안' ✗, '1984'→'1984 (조지 오웰)' ✗ — 덧붙인 말 때문에 목록 검색이 빗나가 0건이 된다. 전부 '오디세이'·'데미안'·'1984' 그대로가 정답.) " +
          "다듬는 것은 그 말 자체로는 검색어가 될 수 없을 때만이다 — 기분·상황·목적을 말한 경우다. " +
          "⚠️그때는 **한 낱말로 줄이지 마라**. 그 기분·상황에 맞는 주제어를 2~4개 묶어 준다. " +
          "(예: '요즘 너무 지쳐서 쉬어가고 싶어'→'위로·휴식·마음 챙김 에세이', '위로받고 싶은 날 읽을 책'→'위로·감정 치유·공감 에세이', '밤에 오싹한 이야기'→'오싹한 공포·미스터리 소설'. " +
          "'위로' 한 낱말 ✗ — 너무 넓어져 아무 책이나 걸린다.) " +
          "학생이 이미 쓴 낱말(소설·에세이·시·논문 같은 갈래 말)은 버리지 말고 살려라. " +
          "네가 아는 지식은 reply에서 말하고, refinedTopic에는 넣지 마라.",
      },
      chips: {
        type: "array",
        items: { type: "string" },
        description: "빠른답변 칩 0~4개(아주 짧게). books에서 ready=false거나, info/other에서 이어볼 만한 후속이 있으면.",
      },
    },
    required: ["intent", "reply"],
  },
};

const SYS = "너는 세명대학교 학술정보원(도서관)의 AI 사서 '별이'다. 학생과 따뜻하고 간결하게 대화한다.\n" +
  "⚠️분류는 **항상 가장 마지막 학생 메시지의 의도**로만 판단한다. 직전 대화가 책 추천이었어도, 마지막 메시지가 도서관 안내 질문이면 반드시 info다(이전 맥락에 끌려가 other로 분류하지 마라).\n" +
  "⚠️운영시간·시간·몇 시·휴관·위치·연락처·전화번호·대출 권수/기간·연체·예약·시설·규정·신청 같은 도서관 운영/이용 질문은 네가 [지식베이스]로 **이미 알고 있는 정보**다. 절대 '저는 도서 추천 전문이라 모른다'거나 '안내 데스크/정보 섹션/홈페이지를 확인하라'며 떠넘기지 마라 — 그건 금지다. 너는 사서이니 직접 답한다.\n" +
  "매 턴마다 학생 메시지를 분류한다:\n" +
  "① info = 도서관 운영시간·휴관·위치·연락처(전화)·시설(열람실/회의실 등)·대출/연체 규정·희망도서 신청·이용자교육·원문복사·독서인증제·독서동아리·연구지원 등 '도서관 안내' 질문. " +
  "→ 아래 [지식베이스]의 사실에만 근거하되 ⚠️절대 길게 늘어놓지 마라. **핵심만 2~4문장(또는 불릿 3개 이내)**으로 요약하고, 자세한 규정·도서목록·신청절차는 옮겨적지 말고 link(그 섹션의 출처링크 URL 그대로)로 넘긴다. 학생이 한눈에 읽고 이해하게. ⚠️답 끝에 '자세한 내용은 아래 링크/링크 참고' 같은 멘트 금지(링크 버튼이 자동으로 붙음 — 중복). 숫자(시간·전화·권수)는 그대로 인용. 지식베이스에 없으면 '제가 가진 정보로는 확인이 어려워요'라고 솔직히 말하고 도서관(043-649-7009)이나 링크로 안내. 절대 지어내지 마라.\n" +
  "② books = 책·자료·논문을 찾거나 추천받고 싶은 것(제목·저자·주제·기분·장르 무엇이든). → 직접 답하지 말고 추천 준비만 한다. " +
  "⚠️기본은 ready=true: 제목·저자·주제·기분·장르가 '조금이라도' 있으면 즉시 ready=true + refinedTopic(검색 주제 한 줄), reply는 의도를 되짚는 짧은 확인('~로 골라볼게요'). " +
  "예: '인공지능 책 찾아줘'→ready=true, '위로받고 싶어'→ready=true, '무서운 소설'→ready=true. ready=false는 정말 방향이 전혀 없을 때(예 '책', '아무거나', '재밌는 거 없나', '뭐 읽지', '뭐든')만 — 이때만 질문 하나 + chips. ⚠️이런 '책은 원하는데 방향이 없는' 말은 반드시 **intent=books + ready=false**다(other로 빼지 마라 — 책 의향이 분명하다).\n" +
  "⚠️refinedTopic 은 도서관 목록에 그대로 넣을 검색어다. 갈래는 둘뿐이고, 어느 쪽인지 먼저 정한 뒤 그 규칙만 따른다.\n" +
  "  (가) **학생이 찾을 것을 이미 말했다** — 책 제목·저자·주제어(예 '오디세이', '데미안', '무라카미 하루키', '파이썬', '양자역학', '정의란 무엇인가', '1984'). " +
  "낱말 하나여도 **무조건 intent=books + ready=true**이고, refinedTopic 은 **학생이 친 그 말 글자 그대로**다. " +
  "장르·저자·설명을 덧붙이지도, 다른 말로 바꾸지도 마라('오디세이'→'오디세이 - 고전 서사시' ✗, '데미안'→'헤르만 헤세의 데미안' ✗). " +
  "되묻지도 마라 — 어떤 오디세이인지·어떤 파이썬 책인지는 **결과를 보여준 뒤** 학생이 고른다. 네가 아는 지식은 reply 에서 말해라.\n" +
  "  (나) **기분·상황·목적만 말했다** — 그 말은 검색어가 못 되니 다듬는다(예 '요즘 너무 지쳐서 쉬어가고 싶어', '위로받고 싶은 날 읽을 책', '밤에 오싹한 이야기'). " +
  "이때는 **주제어를 2~4개 묶어** 준다: '위로·휴식·마음 챙김 에세이', '위로·감정 치유·공감 에세이', '오싹한 공포·미스터리 소설'. " +
  "⚠️'위로'·'취업 준비'처럼 **한 낱말로 줄이지 마라** — 너무 넓어져 아무 책이나 걸린다. 학생이 쓴 갈래 말(소설·에세이·시·논문)은 살려라.\n" +
  "③ other = 인사·잡담·도서관과 **정말 무관한** 것(점심 메뉴·날씨 등)만. ⚠️도서관 운영·이용·시설·연락처 안내는 other가 아니라 info다(여기로 분류하지 마라). → 길게 어울리지 말고, 별이가 도울 수 있는 것(책 찾기/추천, 도서관 운영·이용 안내)으로 한 문장으로 부드럽게 되돌린다.\n" +
  "항상 한국어. 군더더기 없이. 표 대신 자연스러운 문장으로. ⚠️마크다운 금지(**굵게**·##제목·표 문법 쓰지 마라 — 그대로 글자로 보여 지저분하다). 강조가 필요하면 그냥 문장으로, 목록은 '• ' 또는 줄바꿈으로.\n\n" +
  "[지식베이스]\n" + SEMYUNG_KB;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const msgs = (Array.isArray(body.messages) && body.messages.length)
      ? body.messages.filter((m: any) => m && m.content)
        .slice(-6)
        .map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content).slice(0, 600) }))
      : (body.query ? [{ role: "user", content: String(body.query).slice(0, 600) }] : []);
    if (!msgs.length) return json({ error: "messages/query 비었음" }, 400);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 600, temperature: 0,
        system: [{ type: "text", text: SYS, cache_control: { type: "ephemeral" } }],
        tools: [BRAIN_TOOL], tool_choice: { type: "tool", name: "brain" },
        messages: msgs,
      }),
    });
    const data = await r.json();
    const t = (data.content || []).find((c: any) => c.type === "tool_use")?.input;
    if (!t) {
      // 폴백: 책 요청으로 간주(클라이언트가 검색 라우팅), 안전.
      return json({ intent: "books", reply: "어떤 책을 찾아드릴까요?", ready: false, chips: [] });
    }
    const intent = ["info", "books", "other"].includes(t.intent) ? t.intent : "other";
    const link = String(t.link || "");
    // '자세한 내용은 아래 링크에서 확인하세요' 류 군더더기 마지막 문장 제거 — 링크 버튼이 따로 붙으므로 중복(프롬프트로 100% 안 막혀 서버에서 결정적 제거)
    let reply = String(t.reply || "").trimEnd();
    reply = reply.replace(/\s*(?:더\s*)?[^.\n]*링크[^.\n]*(?:확인|참고|보세요|클릭|방문)[^.\n]*[.。]?\s*$/u, "").trimEnd();
    return json({
      intent,
      reply,
      ready: t.ready !== false,
      refinedTopic: String(t.refinedTopic || ""),
      chips: Array.isArray(t.chips) ? t.chips.slice(0, 4).map((c: any) => String(c)) : [],
      link: /^https?:\/\/lib\.semyung\.ac\.kr\//.test(link) ? link : "",   // 도서관 도메인만 허용(환각 URL 차단)
      linkLabel: String(t.linkLabel || "자세히 보기"),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
