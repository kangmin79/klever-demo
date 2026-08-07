// 북스타 — 세명대 전자도서관 구매 전자책 "대출/반납" 라이브 대행
//
// 🎉 8/8 개편: **학생 개인세션** 방식 도입. 포털 연계값(school_no·portal_user_id)이 있으면
//    lib → /relation/eBook → mmbrLnkg 체인으로 학생 본인 전자도서관 세션을 만들어 대출한다.
//    mmbrLnkg가 미리가입 없이 자동 회원연계까지 해주므로 교보 회원등록 API가 필요 없다.
//    → 각자 5권 한도·각자 대출현황. 공유계정의 "남의 대출 자동반납" 리스크 소멸.
//
// 폴백: 연계값이 없는 이용자(현 배너는 학번+이름만 보냄)는 기존 관장님 공유계정으로 처리.
//    공유계정 경로는 데모/소수 전용이며 배너에 연계값이 추가되면 자연히 사라진다.
//
// GET ?action=borrow&brcd=…   → 대출 (loanSrmb·viewerUrl 반환)
//     ?action=return&brcd=…&loanSrmb=… → 반납
//     ?action=extend&loanSrmb=…   → 대출 연장
//     ?action=reserve&brcd=…      → 예약 (전권 대출중일 때)
//     ?action=cancelReserve&brcd=… → 예약 취소
//     ?action=status              → 현재 대출 현황
//     ?action=stock&brcd=…        → 재고(대출중/보유/예약자수) — 공개, 인증 불필요
//     ?action=returnAll           → (공유계정 전용) 전 대출 반납
// 인증: Authorization: Bearer <sso_token> 있으면 개인세션 시도, 없으면 공유계정
import { sessionFromRequest } from "../_shared/sso_token.ts";
import { loadSession } from "../_shared/sso_store.ts";
import { EB, LBRY, Jar, ebGet, ebPost, ebookSession, fetchEbookHandoff, libLoginByPortal, xmlTag } from "../_shared/semyung_session.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

// ── 공유계정(폴백) 전용: 전자도서관 AES 로그인 (aes.js의 mysqlAES 재현) ──
// AES-128-ECB, key="freedom"+널(16B), PKCS7, 대문자 hex
async function aesHex(plain: string): Promise<string> {
  const keyBytes = new Uint8Array(16); // "freedom" + 9 null
  const ks = "freedom";
  for (let i = 0; i < ks.length; i++) keyBytes[i] = ks.charCodeAt(i);
  const data = new TextEncoder().encode(plain); // 우리 id/pw는 ASCII
  const z = Math.floor(data.length / 16);
  const n = 16 * (z + 1) - data.length; // PKCS7 (블록정렬이면 16블록 추가)
  const padded = new Uint8Array(data.length + n);
  padded.set(data);
  padded.fill(n, data.length);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const iv0 = new Uint8Array(16);
  const out = new Uint8Array(padded.length);
  for (let off = 0; off < padded.length; off += 16) {
    // ECB(block) = AES-CBC(block, IV=0)의 첫 16바이트
    const enc = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv0 }, key, padded.slice(off, off + 16)));
    out.set(enc.slice(0, 16), off);
  }
  return [...out].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function sharedAccountSession(): Promise<Jar> {
  const id = Deno.env.get("SEMYUNG_LIB_ID") || "";
  const pw = Deno.env.get("SEMYUNG_LIB_PW") || "";
  if (!id || !pw) throw new Error("계정 미설정");
  const jar = new Jar();
  const r = await fetch(`${EB}/member/loginProcess.json`, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Referer: `${EB}/member/memberLogin.ink` },
    body: new URLSearchParams({ mmbrId: await aesHex(id), pwd: await aesHex(pw), idSave: "false", autoLogin: "false" }),
    redirect: "manual",
  });
  jar.absorb(r);
  const txt = await r.text();
  if (!jar.has("JSESSIONID") || !/"rtnCode"\s*:\s*"T"/.test(txt)) throw new Error("전자도서관 로그인 실패");
  return jar;
}

// 대출 1회 시도
async function doBorrow(jar: Jar, brcd: string) {
  const xml = await ebPost(jar, "/process/contentBorrowProc.xml", { lbryCode: LBRY, brcd, epdeBrcd: "", dvsnCode: "W" });
  return {
    ok: xmlTag(xml, "result") === "True",
    loanSrmb: xmlTag(xml, "loanSrmb"),
    ents: xmlTag(xml, "entsDvsnCode"),
    msg: (xmlTag(xml, "msg") || "대출 실패").replace(/<br\s*\/?>/gi, " "),
  };
}
// 현재 대출 목록(loanSrmb) — 대출현황 페이지 반납 버튼에서 추출
async function listLoans(jar: Jar): Promise<{ loanSrmb: string; title: string }[]> {
  const html = await ebGet(jar, "/myLib/myBorrowList.ink");
  const out: { loanSrmb: string; title: string }[] = [];
  const re = /gFnContentReturnProc\('[^']*','(\d+)'\s*,\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push({ loanSrmb: m[1], title: m[2] });
  return out;
}

// 뷰어 URL 발급 (토큰 내장, 쿠키 없이 단독 실행되는 교보/예스24 DRM 뷰어)
async function viewerUrlFor(jar: Jar, loanSrmb: string, brcd: string): Promise<string> {
  await ebPost(jar, "/process/sessionAddProc.xml", { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd: "", cttsDvsnCode: "001", fileDvsnCode: "", mmbrNum: "", ifType: "W" });
  const wx = await ebGet(jar, `/process/webViewerProc.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&brcd=${brcd}&epdeBrcd=&type=web`);
  if (xmlTag(wx, "result") !== "True") return "";
  const wvUrl = xmlTag(wx, "webViewrUrl");
  const token = xmlTag(wx, "token").replace(/\//g, "-"); // 네이티브와 동일: '/'→'-'
  const title = xmlTag(wx, "title");
  return `${EB}/popup/popWebviewer.ink?webViewrUrl=${wvUrl}&title=${encodeURIComponent(title)}&token=${encodeURIComponent(token)}`;
}

// 전자책 재고 — 상세페이지가 `[ 대출 : 0/1 예약 : 0 ]`으로 노출한다(로그인 불필요).
// 교보가 "별도 개발"이라던 재고 API 대신 쓰는 경로. ⚠️ 정식 API가 아니라 화면 파싱이므로
// 페이지 개편 시 깨질 수 있다 — 못 읽으면 null을 돌려주고 앱은 재고 표시를 생략한다.
async function fetchStock(brcd: string) {
  const r = await fetch(`${EB}/content/contentView.ink?lbryCode=${LBRY}&brcd=${brcd}`, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const html = await r.text();
  const m = /대출\s*:\s*(\d+)\s*\/\s*(\d+)[\s\S]{0,120}?예약\s*:\s*(\d+)/.exec(html.replace(/<[^>]+>/g, " "));
  if (!m) return null;
  const loaned = +m[1], total = +m[2], reserved = +m[3];
  // 버튼 문구가 도서관의 최종 판정("대출" vs "예약") — 숫자보다 이걸 우선한다
  const btn = (/name="brwBtn"[^>]*value="([^"]*)"/.exec(html) || [, ""])[1].trim();
  return { loaned, total, reserved, available: btn ? btn.includes("대출") : loaned < total, btn };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "borrow";
    const brcd = (url.searchParams.get("brcd") || "").replace(/[^0-9A-Za-z]/g, "");

    // 재고는 공개 정보 — 로그인·세션 없이 바로 응답(게스트도 "지금 빌릴 수 있나"를 본다)
    if (action === "stock") {
      if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);
      const st = await fetchStock(brcd);
      return json(st ? { ok: true, action, ...st } : { ok: false, action, error: "재고를 읽지 못했어요" });
    }

    // ① 개인세션 우선 — SSO 토큰의 sid로 저장된 포털 연계값을 꺼내 학생 본인 세션 수립
    let jar: Jar | null = null;
    let personal = false;
    const ses = await sessionFromRequest(req);
    if (ses) {
      const row = await loadSession(ses.sid);
      if (row?.school_no && row?.portal_user_id) {
        try {
          const lib = await libLoginByPortal({ school_no: row.school_no, portal_user_id: row.portal_user_id });
          jar = await ebookSession(await fetchEbookHandoff(lib));
          personal = true;
        } catch (e) { console.error("personal ebook session fail", String(e)); }
      }
    }
    // ② 폴백 — 관장님 공유계정(데모)
    if (!jar) jar = await sharedAccountSession();

    if (action === "status") {
      const body = await ebGet(jar, "/main/userBorrowStatus.json");
      return json({ ok: true, action, personal, status: JSON.parse(body || "{}") });
    }

    if (action === "returnAll") {
      // 공유계정 슬롯 비우기 — 개인세션에서는 위험/불필요하므로 차단
      if (personal) return json({ ok: false, error: "개인 계정에서는 지원하지 않습니다" }, 400);
      const loans = await listLoans(jar);
      const items: unknown[] = [];
      for (const l of loans) {
        const xml = await ebPost(jar, "/process/contentReturnProc.xml", { lbryCode: LBRY, loanSrmb: l.loanSrmb });
        items.push({ loanSrmb: l.loanSrmb, title: l.title, ok: xmlTag(xml, "result") === "True" });
      }
      return json({ ok: true, action, personal, returned: items.filter((i) => (i as { ok: boolean }).ok).length, items });
    }

    // 반납은 loanSrmb만으로 성립 — brcd 요구는 borrow에만.
    // (구버전은 return에도 brcd를 요구해 앱의 반납 버튼이 400으로 실패하고 있었음)
    if (action === "borrow" && !brcd) return json({ ok: false, error: "brcd 필요" }, 400);

    if (action === "borrow") {
      let res = await doBorrow(jar, brcd);
      let autoReturned = 0;
      // 대출한도(5권) 초과 시 — 공유계정에서만 가장 오래된 1권 반납 후 재시도.
      // 개인 계정에서는 남의 책이 아니라 본인 책이므로 함부로 반납하지 않고 안내만 한다.
      if (!res.ok && !personal && /초과|권수|limit/i.test(res.msg)) {
        const loans = await listLoans(jar);
        if (loans.length) {
          const oldest = loans.reduce((a, b) => Number(a.loanSrmb) <= Number(b.loanSrmb) ? a : b);
          await ebPost(jar, "/process/contentReturnProc.xml", { lbryCode: LBRY, loanSrmb: oldest.loanSrmb });
          autoReturned = 1;
        }
        res = await doBorrow(jar, brcd);
      }
      if (!res.ok) return json({ ok: false, action, personal, message: res.msg, autoReturned });
      let viewerUrl = "";
      try { viewerUrl = await viewerUrlFor(jar, res.loanSrmb, brcd); }
      catch (_) { /* 뷰어URL 실패해도 대출은 유효 */ }
      return json({
        ok: true, action, personal, loanSrmb: res.loanSrmb, entsDvsnCode: res.ents, viewerUrl,
        message: "대출 완료 — 대출기간 14일, 읽고 나면 반납해 주세요",
      });
    }

    if (action === "return" || action === "extend") {
      const loanSrmb = (url.searchParams.get("loanSrmb") || "").replace(/[^0-9]/g, "");
      if (!loanSrmb) return json({ ok: false, action, error: "loanSrmb 필요" }, 400);
      const path = action === "return" ? "/process/contentReturnProc.xml" : "/process/contentExtendProc.xml";
      const xml = await ebPost(jar, path, { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd: "" });
      return json({
        ok: xmlTag(xml, "result") === "True", action, personal, loanSrmb,
        message: (xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " "),
      });
    }

    // 전권 대출중인 전자책 예약 — 반납되면 순번대로. 공유계정으로는 의미가 없어 개인세션만 허용.
    if (action === "reserve" || action === "cancelReserve") {
      if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);
      if (!personal) return json({ ok: false, action, error: "도서관 계정 연결이 필요해요" }, 409);
      const path = action === "reserve" ? "/process/contentReserveProc.xml" : "/process/contentReserveCancelProc.xml";
      const xml = await ebPost(jar, path, { lbryCode: LBRY, brcd, epdeBrcd: "" });
      return json({
        ok: xmlTag(xml, "result") === "True", action, personal,
        message: (xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " "),
      });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
