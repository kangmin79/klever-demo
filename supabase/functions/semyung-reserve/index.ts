// 북스타 — 세명대 OPAC "찾아줘북즈"(대출가능 도서 서가 픽업 예약) 라이브 대행
// 도서관장 제공 계정으로 서버가 로그인 → 예약/현황/취소를 북스타 안에서 완결.
// ⚠️ 단일 공유계정(외부이용자) — 데모/소수 파일럿 전용. 한도 1인 3권, 픽업은 계정주 본인.
//
// GET ?reckey=CATTOT000000324242&action=reserve  → 첫 대출가능본 찾아줘북즈 신청
//     ?action=list                                → 현재 신청현황
//     ?reckey=CATTOT...&action=cancel             → 그 책 신청 취소(reckey 매칭)
// 출력: { ok, action, ... , message }
const HOST = "https://lib.semyung.ac.kr";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const RECV = "0001"; // 수령처 = 민송도서관 (유일 옵션)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
const strip = (s: string) =>
  (s || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/\s+/g, " ").trim();
const dec = async (r: Response) => new TextDecoder("utf-8").decode(await r.arrayBuffer());

// set-cookie에서 JSESSIONID 추출
function pickCookie(r: Response): string {
  const arr = (r.headers as any).getSetCookie ? (r.headers as any).getSetCookie() : [];
  for (const c of arr) {
    const m = /^(JSESSIONID)=([^;]+)/.exec(c);
    if (m) return `${m[1]}=${m[2]}`;
  }
  return "";
}

// 도서관장 계정 로그인 → 인증 쿠키
async function login(): Promise<string> {
  const ID = Deno.env.get("SEMYUNG_LIB_ID") || "";
  const PW = Deno.env.get("SEMYUNG_LIB_PW") || "";
  if (!ID || !PW) throw new Error("계정 미설정");
  const body = new URLSearchParams({ id: ID, password: PW });
  const r = await fetch(`${HOST}/login`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body, redirect: "manual",
  });
  const cookie = pickCookie(r);
  // 성공 = 302 redirect to / + 세션쿠키. 실패면 보통 200(에러문구).
  if (!cookie || (r.status !== 302 && r.status !== 303)) throw new Error("로그인 실패(status " + r.status + ")");
  return cookie;
}

// 상세페이지에서 첫 대출가능본(loanreq 링크 = 대출가능본만 렌더됨) 파라미터 추출
async function firstAvailable(cookie: string, reckey: string) {
  const r = await fetch(`${HOST}/search/detail/${reckey}`, { headers: { "User-Agent": UA, Cookie: cookie } });
  const h = await dec(r);
  const m = /\/loanreq\/reqform\?controlno=([^&"]+)&(?:amp;)?main_no=([^&"]+)&(?:amp;)?accession_no=([^&"]+)/.exec(h);
  if (!m) return null;
  return { controlno: m[1], main_no: m[2], accession_no: m[3] };
}

// 상세페이지에서 도서예약(반납대기) 링크 파라미터 — 전권 대출중일 때만 렌더됨
async function reserveTarget(cookie: string, reckey: string) {
  const r = await fetch(`${HOST}/search/detail/${reckey}`, { headers: { "User-Agent": UA, Cookie: cookie } });
  const h = await dec(r);
  const m = /\/search\/reserve\/form\?mainno=([^&"]+)&(?:amp;)?location=([^&"]+)/.exec(h);
  if (!m) return null;
  return { mainno: m[1], location: m[2] };
}

const normAcc = (s: string) => (s || "").replace(/[^0-9]/g, "").replace(/^0+/, ""); // EM0000480646 ↔ EM480646

// 찾아줘북즈 신청현황 파싱: 취소 체크박스(name="checkbox" value=seq) 보유한 데이터 행만
function parseList(h: string) {
  const rows: any[] = [];
  for (const tr of h.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cb = /<input[^>]*name="checkbox"[^>]*value="(\d{6,})"/i.exec(tr)
      || /<input[^>]*value="(\d{6,})"[^>]*name="checkbox"/i.exec(tr);
    if (!cb) continue; // 전체선택('all')·헤더 행 제외
    const tds = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(strip).filter(Boolean);
    const acc = /(EM\d{6,})/.exec(tr);
    // cells = [순번, 제목/저자, 청구기호, 등록번호(EM..), 상태, 신청일]
    rows.push({
      seq: cb[1],                                   // 취소 식별자
      accession_no: acc ? acc[1] : "",
      acc_norm: acc ? normAcc(acc[1]) : "",
      title: (tds[1] || "").split("/")[0].trim(),
      callNum: tds[2] || "",
      status: tds.find((t) => /신청|대기|완료|취소|수령|가능/.test(t)) || "",
      reqDate: tds.find((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)) || "",
    });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "reserve";
    // 🔒 8/9 계약 전 잠금 — 공유계정(03251) 명의의 신청·취소 대행 중단.
    //   이 함수는 인증이 없어서, 로그인 안 한 방문자도 호출만 하면 사서가 실물을 꺼내는
    //   실세계 작업이 '03251' 이름으로 발생했다. 예약류는 학생 본인 명의(semyung-my,
    //   SSO 개인세션)로만 — 앱은 smLoginGuide()로 세명대 로그인을 유도한다.
    //   8/29: 현황 조회(list/holdlist)도 잠금 — 인증 없이 공유계정 신청 목록이 외부에 보였고, 호출마다 학교 서버 로그인이 발생했다.
    //   앱은 본인 현황을 semyung-my(개인 세션)로 본다. 이 함수는 전부 닫힌 상태로 남긴다.
    return json({ ok: false, action, needsLogin: true, error: "도서관 로그인이 필요합니다 — 예약·현황은 본인 이름으로만 볼 수 있어요" });
    // deno-lint-ignore no-unreachable
    if (action !== "list" && action !== "holdlist") {
      return json({ ok: false, action, needsLogin: true, error: "도서관 로그인이 필요합니다 — 예약은 본인 이름으로만 접수돼요" });
    }
    const reckey = (url.searchParams.get("reckey") || "").replace(/[^A-Za-z0-9]/g, "");
    const cookie = await login();

    if (action === "list") {
      const r = await fetch(`${HOST}/loanreq/list`, { headers: { "User-Agent": UA, Cookie: cookie } });
      const rows = parseList(await dec(r));
      return json({ ok: true, action, count: rows.length, rows });
    }
    if (action === "holdlist") { // 도서 예약(반납대기) 현황
      const r = await fetch(`${HOST}/myreserve/list`, { headers: { "User-Agent": UA, Cookie: cookie } });
      const rows = parseList(await dec(r));
      return json({ ok: true, action, count: rows.length, rows });
    }

    if (!/^CATTOT\d+$/.test(reckey)) return json({ ok: false, error: "bad reckey" }, 400);

    if (action === "reserve") {
      const p = await firstAvailable(cookie, reckey);
      if (!p) return json({ ok: false, action, error: "대출가능본 없음(예약 불가)" });
      const body = new URLSearchParams({
        controlno: p.controlno, main_no: p.main_no, accession_no: p.accession_no, receive_location: RECV,
      });
      const r = await fetch(`${HOST}/loanreq/request`, {
        method: "POST",
        headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", Referer: `${HOST}/loanreq/reqform` },
        body, redirect: "manual",
      });
      const txt = r.status === 200 ? await dec(r) : "";
      const ok = r.status === 302 || r.status === 303 || /성공|완료|신청되었|접수/.test(txt);
      return json({
        ok, action, accession_no: p.accession_no, httpStatus: r.status,
        message: ok ? "찾아줘북즈 신청 완료 — 민송도서관 2층 안내데스크에서 24시간 내 수령" : (strip(txt).slice(0, 200) || "신청 실패"),
      });
    }

    if (action === "cancel") {
      const lr = await fetch(`${HOST}/loanreq/list`, { headers: { "User-Agent": UA, Cookie: cookie } });
      const rows = parseList(await dec(lr));
      if (!rows.length) return json({ ok: false, action, error: "취소할 신청 없음" });
      // 우선순위: accession 파라미터(예약 응답값) 매칭 → 그래도 없으면 마지막 1건
      const wantAcc = normAcc(url.searchParams.get("accession") || "");
      const target = (wantAcc && rows.find((x) => x.acc_norm === wantAcc)) || rows[rows.length - 1];
      const body = new URLSearchParams({ checkbox: target.seq });
      const r = await fetch(`${HOST}/loanreq/cancel`, {
        method: "POST",
        headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", Referer: `${HOST}/loanreq/list` },
        body, redirect: "manual",
      });
      return json({ ok: r.status === 302 || r.status === 303 || r.status === 200, action, canceled: target, httpStatus: r.status });
    }

    if (action === "hold") { // 도서 예약(반납되면 순번대로) — 전권 대출중일 때
      const t = await reserveTarget(cookie, reckey);
      if (!t) return json({ ok: false, action, error: "예약 대상 아님(대출가능본이 있거나 예약 불가 자료)" });
      const body = new URLSearchParams({ mainno: t.mainno, location: t.location, popup: "true", revdate: "" });
      const r = await fetch(`${HOST}/search/reserve/request`, {
        method: "POST",
        headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", Referer: `${HOST}/search/reserve/form` },
        body, redirect: "manual",
      });
      const txt = r.status === 200 ? await dec(r) : "";
      const dup = /이미|중복|등록되어|순위/.test(txt);
      const ok = r.status === 302 || r.status === 303 || /성공|완료|신청되었|접수|예약\s*되었|되었습니다/.test(txt);
      return json({
        ok, action, mainno: t.mainno, httpStatus: r.status,
        message: ok ? "도서 예약 완료 — 반납되면 순번대로 대출 안내를 보내드려요"
          : (dup ? "이미 예약한 책이에요" : (strip(txt).slice(0, 200) || "예약 실패")),
      });
    }

    if (action === "unhold") { // 도서 예약 취소
      const lr = await fetch(`${HOST}/myreserve/list`, { headers: { "User-Agent": UA, Cookie: cookie } });
      const rows = parseList(await dec(lr));
      if (!rows.length) return json({ ok: false, action, error: "취소할 예약 없음" });
      const wantCall = (url.searchParams.get("call") || "").replace(/\s/g, "");
      const target = (wantCall && rows.find((x) => x.callNum.replace(/\s/g, "") === wantCall)) || rows[rows.length - 1];
      const body = new URLSearchParams({ checkbox: target.seq });
      const r = await fetch(`${HOST}/myreserve/cancel`, {
        method: "POST",
        headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded", Referer: `${HOST}/myreserve/list` },
        body, redirect: "manual",
      });
      return json({ ok: r.status === 302 || r.status === 303 || r.status === 200, action, canceled: target, httpStatus: r.status });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
