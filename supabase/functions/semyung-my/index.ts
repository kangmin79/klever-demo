// 북스타 — 세명대 "내 도서관" 정식 openapi 프록시 (종이책 개인기능)
// 퓨처누리 TulipWeb2 openapi: myloan(대출현황/이력/연장) + myreserve(예약) + mypreserve(보존서고)
// uid=학번만으로 조회·쓰기가 되는 구조라 → 클라이언트에 uid/엔드포인트 직노출 금지,
// 반드시 이 프록시를 통해 SSO 세션토큰(HMAC 서명, sso-login 발급)의 학번으로만 호출.
//
// GET/POST (Authorization: Bearer <sso_token> 또는 ?sso_token=):
//   action=info                          → 대출·연체·예약 건수 (myloan verb=info)
//   action=loans                         → 현재 대출 목록 (myloan verb=list)
//   action=history                       → 이전 대출 기록 (myloan verb=history)
//   action=renew&accession_no=EM…        → 대출 연장 신청 (myloan verb=renew)
//   action=reservations                  → 예약 현황 (myreserve verb=list)
//   action=reserve&main_no=…&location=…  → 예약 신청 (location=holding의 location, 규격서 미기재 필수)
//   action=cancelReserve&main_no=…       → 예약 취소 (myreserve verb=cancel)
//   action=preserves                     → 보존서고 신청 현황 (mypreserve verb=list)
//   action=preserve&control_no=&accession_no=&main_no= → 보존서고 신청
//   action=cancelPreserve&loan_req_no=…  → 보존서고 취소 (신청단계 0001만)
//   action=holding&ctrl=555035           → 소장·대출상태 + main_no·예약가능 (bookinfo, 예약 재료용 — 토큰 불필요)
import { sessionFromRequest } from "../_shared/sso_token.ts";
import { loadSession } from "../_shared/sso_store.ts";

const HOST = "https://lib.semyung.ac.kr/openapi";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// ── 범용 XML→JSON (규격서에 없는 필드도 그대로 살림 — myloan list 등 실전 구조 미확정 대비) ──
const unCdata = (s: string) => {
  const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s.trim());
  return (m ? m[1] : s).trim();
};
function xmlToObj(xml: string): any {
  const src = xml.replace(/<\?xml[\s\S]*?\?>/, "").trim();
  const tagRe = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<([A-Za-z_][\w.-]*)(?:\s[^>]*)?\/>/g;
  const out: Record<string, any> = {};
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = tagRe.exec(src))) {
    any = true;
    const name = m[1] || m[3];
    const inner = m[2] ?? "";
    const val = /<[A-Za-z_][\w.-]*(\s[^>]*)?\/?>/.test(inner) ? xmlToObj(inner) : unCdata(inner);
    if (name in out) {
      if (!Array.isArray(out[name])) out[name] = [out[name]];
      out[name].push(val);
    } else out[name] = val;
  }
  return any ? out : unCdata(src);
}

async function api(path: string, params: Record<string, string>): Promise<{ raw: string; data: any }> {
  const qs = new URLSearchParams(params);
  const r = await fetch(`${HOST}/${path}?${qs}`, { headers: { "User-Agent": UA } });
  const raw = new TextDecoder("utf-8").decode(await r.arrayBuffer());
  return { raw, data: xmlToObj(raw) };
}

// err 코드(011=verb 미인식 등)·성공 여부 판독 — 응답에 <err>나 <error> 있으면 실패로
function apiErr(data: any): string {
  const e = data?.result?.err ?? data?.result?.error ?? data?.err ?? data?.error;
  return e ? String(e) : "";
}

const digits = (s: string) => (s || "").replace(/[^0-9]/g, "");
const alnum = (s: string) => (s || "").replace(/[^0-9A-Za-z]/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    let body: Record<string, string> = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* form/empty 무시 */ }
    }
    const p = (k: string) => String(url.searchParams.get(k) ?? body[k] ?? "").trim();
    const action = p("action") || "info";

    // holding은 공개 데이터(소장상태) — 토큰 불필요
    if (action === "holding") {
      const ctrl = digits(p("ctrl")).padStart(12, "0");
      if (ctrl === "000000000000") return json({ ok: false, error: "ctrl 필요" }, 400);
      const { data } = await api("bookinfo", { cid: `CAT${ctrl}`, verb: "holding" });
      return json({ ok: true, action, data: data?.result ?? data });
    }

    // 이하 전부 개인기능 — SSO 세션토큰 필수.
    // ⚠️ uid는 학번이 아니라 liid(도서관 회원번호). 8/8 실측: 학번을 넣으면 "해당 이용자 정보가 없습니다".
    //    liid는 lib 세션에서만 얻어지며 sso-login이 sso_sessions에 저장해 둔다.
    const ses = await sessionFromRequest(req, body.sso_token);
    if (!ses) return json({ ok: false, error: "로그인이 필요합니다(sso_token 없음/만료)" }, 401);
    const row = await loadSession(ses.sid);
    const uid = row?.liid || "";
    if (!uid) {
      return json({
        ok: false, needsPersonal: true,
        error: "도서관 개인정보 연동이 아직 열리지 않았습니다. 도서관 홈페이지 배너로 다시 로그인해 주세요.",
      }, 409);
    }

    let path = "myloan";
    const params: Record<string, string> = { uid };

    if (action === "info") params.verb = "info";
    else if (action === "loans") params.verb = "list";
    else if (action === "history") params.verb = "history";
    else if (action === "renew") {
      const acc = alnum(p("accession_no"));
      if (!acc) return json({ ok: false, error: "accession_no 필요" }, 400);
      params.verb = "renew";
      params.accesssion_no = acc; // ⚠️ 규격서 원문 철자(s 3개) — 서버가 이 이름만 인식(8/6 실측)
      params.accession_no = acc;  // 표준 철자도 병행(무해)
    } else if (action === "reservations" || action === "reserve" || action === "cancelReserve") {
      path = "myreserve";
      if (action === "reservations") { params.verb = "list"; params.page = digits(p("page")) || "1"; }
      else {
        const mainNo = digits(p("main_no"));
        if (!mainNo) return json({ ok: false, error: "main_no 필요" }, 400);
        params.verb = action === "reserve" ? "request" : "cancel";
        params.main_no = mainNo;
        // ⚠️ location = 규격서에 없는 필수 파라미터(8/8 실측: 없으면 011, 있으면 처리 진입).
        //    bookinfo holding의 <location>(예: A0000001)을 그대로 전달. 취소는 없어도 처리되나 있으면 병행.
        const loc = alnum(p("location"));
        if (action === "reserve" && !loc) return json({ ok: false, error: "location 필요(holding의 location)" }, 400);
        if (loc) params.location = loc;
      }
    } else if (action === "preserves" || action === "preserve" || action === "cancelPreserve") {
      path = "mypreserve";
      // ⚠️ 파라미터 철자는 규격서 표(controlno…) 아닌 예제가 정답: control_no/accession_no/main_no (8/8 실측)
      if (action === "preserves") { params.verb = "list"; params.page = digits(p("page")) || "1"; }
      else if (action === "preserve") {
        const controlNo = digits(p("control_no") || p("controlno")), accNo = alnum(p("accession_no") || p("accessionno")), mainNo = digits(p("main_no") || p("mainno"));
        if (!controlNo || !accNo || !mainNo) return json({ ok: false, error: "control_no/accession_no/main_no 필요" }, 400);
        params.verb = "request";
        params.control_no = controlNo.padStart(12, "0"); params.accession_no = accNo; params.main_no = mainNo;
      } else {
        const reqNo = digits(p("loan_req_no"));
        if (!reqNo) return json({ ok: false, error: "loan_req_no 필요" }, 400);
        params.verb = "cancel"; params.loan_req_no = reqNo; params.status = "0001"; // 신청단계만 취소 가능
      }
    } else return json({ ok: false, error: "unknown action" }, 400);

    const { data } = await api(path, params);
    const err = apiErr(data);
    if (err) return json({ ok: false, action, err, data: data?.result ?? data });
    // 쓰기류(request/cancel/renew)는 <code>0</code>이 성공 — 정규화해서 앱이 ok만 보면 되게
    const code = data?.result?.code;
    const ok = code !== undefined ? String(code) === "0" : true;
    return json({ ok, action, data: data?.result ?? data });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
