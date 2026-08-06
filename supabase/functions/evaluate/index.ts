// 북스타 — 독후감/서평 AI 평가 엔진
// 입력: { text: "독후감 본문", title?, book? }
// 흐름: 루브릭(고정·캐싱) + Claude Sonnet → 항목별 채점·근거 → 서버에서 총점·등급 산출
// 시크릿(env): CLAUDE_API_KEY
// 루브릭 근거: 경북독서친구(정부) 독후감 심사기준 + 학술 독후감 평가 통념

const CLAUDE = Deno.env.get("CLAUDE_API_KEY")!;
const MODEL = "claude-sonnet-4-6";

// 평가 항목·배점 (서버가 권위. 모델 점수는 이 max로 클램프)
const CRITERIA = [
  { key: "understanding", label: "책 이해·충실성", max: 25, desc: "책의 핵심 내용·맥락을 정확히 이해하고 자기 언어로 소화했는가" },
  { key: "insight",       label: "사고·해석의 깊이", max: 25, desc: "단순 요약을 넘어 자기 생각·통찰·창의적 해석이 있는가" },
  { key: "structure",     label: "논리·구성",       max: 20, desc: "글의 짜임과 흐름이 일관되고 논리적인가" },
  { key: "evidence",      label: "근거·인용",       max: 15, desc: "주장을 책 내용(장면·문장·사건)으로 뒷받침했는가" },
  { key: "expression",    label: "표현·문장력",     max: 15, desc: "어휘·문장·맞춤법 등 표현 완성도" },
];
const MAX: Record<string, number> = Object.fromEntries(CRITERIA.map((c) => [c.key, c.max]));

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

const SYS =
`너는 대학 도서관 독후감/서평 공모전의 공정한 전문 심사위원이다. 아래 루브릭(100점 만점)으로만 채점한다.

[루브릭]
1) 책 이해·충실성 (0~25): 책의 핵심 내용·주제·맥락을 정확히 이해하고 자기 언어로 소화했는가. 사실 오류가 있으면 감점.
2) 사고·해석의 깊이 (0~25): 줄거리 요약을 넘어 글쓴이의 생각·해석·통찰·질문이 있는가. (독후감의 핵심은 '요약'이 아니라 '독자의 사유'다.)
3) 논리·구성 (0~20): 도입–전개–마무리의 짜임과 흐름이 일관되고 설득력 있는가.
4) 근거·인용 (0~15): 주장을 책 속 장면·문장·사건 등 구체적 근거로 뒷받침했는가.
5) 표현·문장력 (0~15): 어휘 선택, 문장 완성도, 맞춤법·문법.

[채점 원칙 — 엄격히]
- 오직 제출된 본문에 근거해 채점한다. 본문에 없는 내용으로 칭찬하거나 감점하지 않는다.
- 각 항목 reason에는 반드시 본문의 구체적 부분(인용·요지)을 근거로 1~2문장으로 적는다.
- 후하지도 박하지도 않게, 항목별 배점 범위 안에서 변별력 있게 준다(전부 만점/전부 0점 금지).
- 짧은 분량은 깊이·근거·구성에서 자연히 낮은 점수로 반영하되, 분량 자체를 별도 감점하지는 않는다.
- ai_suspicion(AI로 작성했을 가능성)은 참고용 보조 신호다: 지나치게 매끄럽고 개성 없는 상투적 문장, 책과 무관한 일반론, 구체적 체험·감정의 부재 등을 근거로 낮음/보통/높음 중 하나와 한 줄 근거를 적는다. 단정하지 말고 '참고' 수준으로.
- 모든 출력은 한국어.`;

const TOOL = {
  name: "evaluation",
  description: "독후감을 루브릭 5개 항목으로 채점하고 근거·총평·AI작성 의심도를 반환",
  input_schema: {
    type: "object",
    properties: {
      criteria: {
        type: "array",
        description: "5개 항목 각각의 점수와 근거",
        items: {
          type: "object",
          properties: {
            key: { type: "string", enum: CRITERIA.map((c) => c.key) },
            score: { type: "integer", description: "해당 항목 점수(0 이상, 항목 배점 이하 정수)" },
            reason: { type: "string", description: "본문 근거를 든 1~2문장 평가" },
          },
          required: ["key", "score", "reason"],
        },
      },
      summary: { type: "string", description: "한 줄 총평" },
      strengths: { type: "string", description: "잘한 점(1~2가지)" },
      improvements: { type: "string", description: "개선하면 좋을 점(1~2가지)" },
      ai_suspicion: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["낮음", "보통", "높음"] },
          note: { type: "string", description: "그 판단의 한 줄 근거(참고용)" },
        },
        required: ["level", "note"],
      },
    },
    required: ["criteria", "summary", "ai_suspicion"],
  },
};

function gradeOf(total: number): string {
  if (total >= 90) return "금상";
  if (total >= 80) return "은상";
  if (total >= 70) return "동상";
  if (total >= 60) return "장려상";
  return "수상권 밖";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const text = (body?.text || "").toString().trim();
    if (!text) return json({ error: "text 비었음" }, 400);
    if (text.length < 50) return json({ error: "평가하기엔 글이 너무 짧아요 (최소 50자)" }, 400);

    const meta: string[] = [];
    if (body?.book) meta.push(`대상 도서: ${body.book}`);
    if (body?.title) meta.push(`독후감 제목: ${body.title}`);
    const user = `${meta.length ? meta.join("\n") + "\n\n" : ""}[독후감 본문]\n${text.slice(0, 12000)}`;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": CLAUDE, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: [{ type: "text", text: SYS, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: user }],
      }),
    });
    const data = await r.json();
    const out = (data.content || []).find((c: any) => c.type === "tool_use")?.input;
    if (!out || !Array.isArray(out.criteria)) return json({ error: "평가 실패(모델 응답)", raw: data?.error || null }, 502);

    // 서버가 점수 권위: max로 클램프 + 항목 채움 + 총점/등급 산출
    const byKey: Record<string, any> = {};
    for (const c of out.criteria) byKey[c.key] = c;
    const criteria = CRITERIA.map((def) => {
      const got = byKey[def.key] || {};
      let score = Number(got.score);
      if (!Number.isFinite(score)) score = 0;
      score = Math.max(0, Math.min(def.max, Math.round(score)));
      return { key: def.key, label: def.label, max: def.max, score, reason: (got.reason || "").toString() };
    });
    const total = criteria.reduce((s, c) => s + c.score, 0);

    return json({
      total,
      grade: gradeOf(total),
      criteria,
      summary: out.summary || "",
      strengths: out.strengths || "",
      improvements: out.improvements || "",
      ai_suspicion: out.ai_suspicion || { level: "낮음", note: "" },
      model: MODEL,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
