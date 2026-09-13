// 북스타 — 세명대 전자도서관 구매 전자책 "대출/반납" 라이브 대행
//
// 🎉 8/8 개편: **학생 개인세션** 방식 도입. 포털 연계값(school_no·portal_user_id)이 있으면
//    lib → /relation/eBook → mmbrLnkg 체인으로 학생 본인 전자도서관 세션을 만들어 대출한다.
//    mmbrLnkg가 미리가입 없이 자동 회원연계까지 해주므로 교보 회원등록 API가 필요 없다.
//    → 각자 5권 한도·각자 대출현황. 공유계정의 "남의 대출 자동반납" 리스크 소멸.
//
// 🔒 8/9 개편: **공유계정 폴백 폐지**. 연계값이 없는 이용자(=도서관 계정 미연결)는
//    대출·반납·연장·예약·대출현황 전부 거부(409 needsPersonal)하고 로그인 안내를 받는다.
//    이유: 폴백은 관장님 계정 한 칸을 익명 방문자가 쓰는 구조라 ①관장님 실명으로 대출기록이 남고
//    ②5칸이 차면 "가장 오래된 1권 강제 반납"이 돌아 남이 읽던 책이 끊겼다.
//    공개는 재고(stock) 하나뿐 — "지금 빌릴 수 있나"는 로그인 없이도 보여야 하므로.
//
// GET ?action=borrow&brcd=…   → 대출 (loanSrmb·viewerUrl 반환)
//     ?action=return&brcd=…&loanSrmb=… → 반납
//     ?action=extend&loanSrmb=…   → 대출 연장
//     ?action=reserve&brcd=…      → 예약 (전권 대출중일 때)
//     ?action=cancelReserve&brcd=… → 예약 취소
//     ?action=status              → 현재 대출 현황
//     ?action=stock&brcd=…        → 재고(대출중/보유/예약자수) — 공개, 인증 불필요
//     ?action=returnAll&key=…     → (관리자 전용) 공유계정에 남은 대출 전부 반납
// 인증: Authorization: Bearer <sso_token> 필수. 없으면 stock 외 전부 409.
//
// 🎉 9/8 정식 API 전환 (학교 방화벽 446 개방 → 교보 조회 API + 처리 API). 화면 긁기가 목록·재고 경로에서 사라졌다.
//    - stock        : 교보 contentInfo(중계 경유) 우선 → 실패하면 표(solsup_stock) 폴백
//    - myLoans      : 교보 userBorrowList → 실패하면 옛 HTML 파싱 폴백
//    - myReserves   : 교보 userReserveList → 실패하면 옛 HTML 파싱 폴백
//    - return·extend·cancelReserve : ⚠️ 9/11 옛 세션 경로로 복귀 — frontapi에 연계폼 user_id를 넘기면 NOT_EXIST_MEMBER_INFO.
//                                     (목록 API도 같은 이유로 9998 → 지금은 HTML 폴백이 실제로 일함) 교보 확인 전까지 세션 경로 고정
//    - borrow·viewer·status·reserve : 개인세션(옛 경로) 그대로 — 뷰어 URL 발급이 /process/* 에 묶여 있어 검증된 길을 유지
//    user_id(교보 규약 암호화 ID)는 lib 로그인 → 연계폼에서 얻는다(개인세션 수립보다 한 단계 앞). 세션은 필요한 액션에서만 만든다.
import { sessionFromRequest } from "../_shared/sso_token.ts";
import { loadSession } from "../_shared/sso_store.ts";
import { stockOneFromTable } from "../_shared/stock_table.ts";
import { EB, LBRY, Jar, ebGet, ebPost, ebookSession, fetchEbookHandoff, libLoginByPortal, listEbookLoans, xmlTag } from "../_shared/semyung_session.ts";
import type { EbookHandoff } from "../_shared/semyung_session.ts";
import { kyoboBorrowList, kyoboReserveList, kyoboStock } from "../_shared/kyobo_api.ts";

// 정식 API로 얻은 재고를 표(solsup_stock)에도 적어 둔다 — 검색·닮은책(stockFromTable)이 같은 최신값을 보게. 있는 행만 고친다(없으면 무시). 응답은 안 기다림.
function writeStockThrough(brcd: string, st: { loaned: number; total: number; reserved: number; available: boolean }): void {
  try {
    const base = Deno.env.get("SUPABASE_URL") || "", srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!base || !srv || !brcd) return;
    const p = fetch(`${base}/rest/v1/solsup_stock?brcd=eq.${encodeURIComponent(brcd)}`, {
      method: "PATCH", headers: { apikey: srv, Authorization: `Bearer ${srv}`, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ loaned: st.loaned, total: st.total, reserved: st.reserved, available: st.available, checked_at: new Date().toISOString() }),
    }).then((r) => r.text()).catch(() => {});
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch (_) { /* 없으면 떠 있는 프라미스 */ }
  } catch (_) { /* 표 갱신 실패는 응답에 영향 없음 */ }
}

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
// 현재 대출 목록 — 파서는 _shared/semyung_session.ts에 공용으로 있다(알림 배치와 동일 코드 사용)
const listLoans = listEbookLoans;

// 내가 예약한 전자책 — 취소 버튼(gFnContentReserveCancelProc)에서 예약번호를 뽑는다.
// 대출목록과 같은 구조: 취소 버튼이 항목 끝에 오고 그 앞 구간에 서지·순번이 있다.
interface EbReserve { prenSrmb: string; brcd: string; title: string; rank: string }
async function listReserves(jar: Jar): Promise<EbReserve[]> {
  const html = await ebGet(jar, "/myLib/myReserveList.ink");
  const out: EbReserve[] = [];
  const re = /gFnContentReserveCancelProc\('([^']*)','(\d+)'\s*,\s*'([^']*)'/g;
  let m: RegExpExecArray | null, prev = 0;
  while ((m = re.exec(html))) {
    const raw = html.slice(prev, m.index);
    prev = m.index + m[0].length;
    out.push({
      prenSrmb: m[2], title: m[3],
      brcd: (/fnContentClick\([^)]*?'(\d{6,13})'/.exec(raw) || [, ""])[1] || "",
      rank: (/(\d+)\s*번/.exec(raw.replace(/<[^>]+>/g, " ")) || [, ""])[1] || "",
    });
  }
  return out;
}

// 뷰어 URL 발급 — 도서관 '보기' 버튼(process.js gFnEBookFileChoicePopup)과 **같은 순서**로 간다.
//
// 🚨 8/21 사고: 세명대 전자책은 교보문고·YES24 두 공급사인데(실측 55:45) 예전 코드는 popupInfo를 건너뛰고
//    무조건 교보 뷰어 URL을 만들었다 → YES24 책은 대출은 되는데 열면 "DRM 인증 처리에 문제(403)".
//    게다가 sessionAddProc가 <result>False</result> "라이선스 오류"를 돌려줘도 읽지 않고 통과시켜
//    깨진 URL을 '성공'으로 앱에 넘겼다. 절반의 책이 조용히 안 열리고 있었다.
//
// 규칙(재발 방지):
//   ① 도서관 XML의 <result>는 빠짐없이 검사한다. False면 도서관이 준 <msg>를 그대로 올린다 — 우리가 지어내지 않는다.
//   ② 파라미터는 추측하지 않는다. popupInfo.xml이 주는 값(barcode·seqBarcode·userId·productCD·useCondition·comCode)을 쓴다.
//   ③ 실패는 {url:""} + error로 돌려 호출부가 학생에게 이유를 말하게 한다. 빈 문자열만 돌려주고 끝내지 않는다.
// YES24: 도서관이 주는 apiUrl은 '바로보기 / 뷰어보기'를 고르라는 **선택 화면**이다.
//   학생 입장에선 읽기까지 한 번 더 누르는 마찰이라(원칙: 찾고→읽기 마찰 < 밀리), 그 화면의 '바로보기'가
//   만들어 내는 주소를 서버가 미리 계산해서 바로 건넨다. 계산식은 도서관 webview.js의 goViewer()와 글자 그대로 동일:
//     url = 도메인 + code + "/" + subcode + "/" + encodeURIComponent(암호문.replace(/\//g,"-"))
//   ⚠️ 암호문은 발급 때마다 꼬리가 달라진다(8/21 재실측 — 앞부분만 같음). 그래서 저장해 두고 재사용하면 안 되고,
//     지금처럼 열 때마다 선택 화면을 새로 읽어 그 자리에서 뽑는다. 세션 쿠키는 안 쓰므로(연결 자체가 무쿠키) 발급자·사용자 IP가 달라도 된다.
//   파싱이 어긋나면 빈 값을 돌려 호출부가 선택 화면 주소를 그대로 쓰게 한다 — 못 여는 것보다 한 번 더 누르는 게 낫다.
//   📌 8/21 아침 실측: b2bwv.yes24.com(웹리더)·www.yes24.com이 SK망(SKT LTE·SKB)에서 통째로 시간초과 — YES24측/구간 장애.
//     같은 시각 교보·네이버·yes24 CDN은 정상, AWS에서는 b2bwv도 정상. 이런 증상이 또 오면 우리 코드가 아니라 회선↔공급사부터 의심할 것.
async function yes24DirectUrl(apiUrl: string): Promise<string> {
  // 실패 사유를 반드시 로그로 남긴다(8/24 — 폰이 선택 화면으로 후퇴하는 원인 추적. 조용한 실패 금지)
  try {
    const r = await fetch(apiUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) { console.error("y24direct http", r.status, apiUrl.slice(0, 120)); return ""; }
    const html = new TextDecoder("euc-kr").decode(await r.arrayBuffer());
    const m = /goViewer\('([^']+)','([^']+)','([^']+)','([^']+)'\)/.exec(html);
    if (!m) { console.error("y24direct nomatch", apiUrl.slice(0, 120), html.replace(/\s+/g, " ").slice(0, 200)); return ""; }
    return m[1] + m[2] + "/" + m[3] + "/" + encodeURIComponent(m[4].split("/").join("-"));
  } catch (e) { console.error("y24direct err", String(e)); return ""; }
}

interface ViewerRes { url: string; vendor: "external" | "kyobo" | ""; error?: string }
// mobile=true(솔숲 앱 등 폰): 도서관 모바일 사이트(mobileProcess.js)와 같은 순서 — licenseCheck + type=mobile.
//   type=web 토큰을 폰에서 열면 PC용 뷰어가 나와 레이아웃이 깨진다(8/21 실기기 비교: 도서관 모바일=정돈된 폰 뷰어 vs 우리=깨짐).
async function viewerUrlFor(jar: Jar, loanSrmb: string, brcdHint: string, mobile = false): Promise<ViewerRes> {
  // 1) popupInfo — 공급사 분기 + 교보용 정확한 값. 도서관 버튼이 제일 먼저 부르는 것
  const pi = await ebGet(jar, `/process/popupInfo.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&ifType=W`);
  if (xmlTag(pi, "result") !== "True") {
    return { url: "", vendor: "", error: xmlTag(pi, "msgcode") || "도서관이 열람 정보를 주지 않았어요" };
  }
  // 2) 외부 공급사(YES24 등): 도서관이 준 주소가 곧 뷰어 진입점. 교보 토큰을 만들면 안 된다.
  //    8/24 저녁: 직행(선택 화면 건너뛰기)이 계정·책 가리지 않고 첫 시도부터 403("동일 도서 1개 브라우저 창")
  //      — 서로 다른 계정 2개·서로 다른 책 3권으로 재현, 매번 즉시 실패(실측). 이건 잠금이 쌓인 게 아니라
  //      선택 화면을 안 거쳐서(referer·쿠키 없이 콘텐츠 서버로 바로 감) yes24가 "정상 창 아님"으로 막는 것으로 추정.
  //      원인 확정 전까지 직행은 끄고 선택 화면 그대로 준다 — 학생이 그 화면에서 '바로보기'를 한 번 더 눌러야 하지만
  //      그게 도서관 정식 경로이자 지금 유일하게 검증된 경로.
  const apiUrl = xmlTag(pi, "apiUrl");
  if (apiUrl) {
    console.error("y24 viewer", "chooser-only(direct disabled 8/24)", "mobile=" + mobile, apiUrl.slice(0, 120));
    return { url: apiUrl, vendor: "external" };
  }

  // 3) 교보: 라이선스(웹세션) 등록 → 결과 반드시 확인.
  //    ⚠️ 파라미터 조합은 '기존 방식(빈값)'을 먼저 쓴다 — 8/21 이전에 교보 책이 열리던 경로를 절대 바꾸지 않기 위함(회귀 방지).
  //    빈값이 False면 그때만 popupInfo가 준 값으로 재시도한다. 둘 다 False면 도서관 메시지를 그대로 올린다.
  const brcd = xmlTag(pi, "barcode") || brcdHint;
  const epdeBrcd = xmlTag(pi, "seqBarcode");
  if (mobile) {
    // 모바일 공식 순서(mobileProcess.js gFnWebViewerProc): licenseCheck → webViewerProc?type=mobile
    const lc = await ebPost(jar, "/process/licenseCheck.xml", { lbryCode: LBRY, brcd, epdeBrcd });
    if (xmlTag(lc, "result") !== "True") {
      return { url: "", vendor: "kyobo", error: xmlTag(lc, "msg").replace(/<br\s*\/?>/gi, " ") || "라이선스 확인에 실패했어요" };
    }
  } else {
    const legacy = { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd: "", cttsDvsnCode: "001", fileDvsnCode: "", mmbrNum: "", ifType: "W" };
    let sa = await ebPost(jar, "/process/sessionAddProc.xml", legacy);
    if (xmlTag(sa, "result") !== "True") {
      const full = { lbryCode: LBRY, loanSrmb, brcd, epdeBrcd, cttsDvsnCode: xmlTag(pi, "productCD") || "001", fileDvsnCode: xmlTag(pi, "useCondition"), mmbrNum: xmlTag(pi, "userId"), ifType: "W" };
      sa = await ebPost(jar, "/process/sessionAddProc.xml", full);
      if (xmlTag(sa, "result") !== "True") {
        return { url: "", vendor: "kyobo", error: xmlTag(sa, "msg").replace(/<br\s*\/?>/gi, " ") || "라이선스 등록에 실패했어요" };
      }
    }
  }
  // 4) 웹뷰어 토큰 (모바일이면 type=mobile — 교보가 폰용 뷰어를 내준다)
  const wx = await ebGet(jar, `/process/webViewerProc.xml?lbryCode=${LBRY}&loanSrmb=${loanSrmb}&brcd=${brcd}&epdeBrcd=${mobile ? encodeURIComponent(epdeBrcd) : ""}&type=${mobile ? "mobile" : "web"}`);
  if (xmlTag(wx, "result") !== "True") {
    return { url: "", vendor: "kyobo", error: xmlTag(wx, "msg") || "뷰어 토큰을 받지 못했어요" };
  }
  const wvUrl = xmlTag(wx, "webViewrUrl");
  const token = xmlTag(wx, "token").replace(/\//g, "-"); // 도서관 JS와 동일: '/'→'-'
  const title = xmlTag(wx, "title");
  return { url: `${EB}/popup/popWebviewer.ink?webViewrUrl=${wvUrl}&title=${encodeURIComponent(title)}&token=${encodeURIComponent(token)}`, vendor: "kyobo" };
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
  // 버튼이 도서관의 최종 판정 — 빌릴 수 있으면 brwBtn("대출"), 전권 나갔으면 reveBtn("예약")이 뜬다.
  // (둘은 서로 배타적으로 렌더되므로 어느 쪽이 있는지가 곧 대출 가능 여부다)
  const btn = (/name="(?:brwBtn|reveBtn)"[^>]*value="([^"]*)"/.exec(html) || [, ""])[1].trim();
  return {
    loaned, total, reserved,
    available: btn ? btn.includes("대출") : loaned < total,
    reservable: btn === "예약",
    btn,
  };
}

// 8/22 솔숲 앱 "책이 움직이면 앱도 움직인다": 우리 앱을 거친 대출·반납은 우리가 제일 먼저 안다 → 홈 조립기에 즉시 알려
//   그 책 재고만 재확인하고 홈을 다시 짓게 한다(응답은 안 기다림). 키는 같은 프로젝트 시크릿(SOLSUP_ADMIN_KEY).
function notifyStockChanged(brcd: string): void {
  try {
    const key = Deno.env.get("SOLSUP_ADMIN_KEY") || Deno.env.get("SEMYUNG_ADMIN_KEY") || "";
    const base = Deno.env.get("SUPABASE_URL") || "";
    if (!key || !base || !brcd) return;
    const p = fetch(`${base}/functions/v1/solsup-home?action=changed&key=${encodeURIComponent(key)}&brcd=${encodeURIComponent(brcd)}`).then((r) => r.text()).catch(() => {});
    try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch (_) { /* waitUntil 없으면 떠 있는 프라미스 */ }
  } catch (_) { /* 알림 실패는 대출 결과에 영향 없음 */ }
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
      // 9/8: 교보 정식 재고 API(contentInfo, 호출 빈도 제한 없음 — 9/6 교보 확인)를 먼저 본다. 화면 긁기 아님.
      //   중계가 죽었거나 시크릿이 없으면 표(solsup_stock)로 폴백(8/29 설계 그대로). 표에도 없으면 ok:false → 웹은 배지를 조용히 생략.
      try {
        const live = await kyoboStock(brcd);
        if (live) {
          writeStockThrough(brcd, live);
          return json({ ok: true, action, source: "api", checked_at: new Date().toISOString(), age_min: 0, ...live });
        }
        // 9998 = 교보에 없는 상품(바코드 불일치 등) → 표로
      } catch (e) { console.error("stock api fail → table", String(e).slice(0, 120)); }
      const st = await stockOneFromTable(brcd);
      return json(st
        ? { ok: true, action, source: "table", checked_at: st.checked_at, age_min: Math.round(st.age_ms / 60000), loaned: st.loaned, total: st.total, reserved: st.reserved, available: st.available, reservable: st.reservable, btn: st.btn }
        : { ok: false, action, source: "table", error: "표에 최근 재고가 없어요" });
    }
    if (action === "stockLive") {
      const liveKey = Deno.env.get("STOCK_LIVE_KEY") || "";
      if (!liveKey || url.searchParams.get("key") !== liveKey) return json({ ok: false, action, error: "권한이 없습니다" }, 403);
      if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);
      const st = await fetchStock(brcd);
      return json(st ? { ok: true, action, source: "live", ...st } : { ok: false, action, source: "live", error: "재고를 읽지 못했어요" });
    }

    // 관리자 전용 — 폴백 시절 공유계정에 남은 대출을 비우는 청소용. 키는 서버 시크릿과 대조한다.
    // (예전엔 누구나 부를 수 있어 관장님 대출을 통째로 반납시킬 수 있었다)
    if (action === "returnAll") {
      const admin = Deno.env.get("SEMYUNG_ADMIN_KEY") || "";
      if (!admin || url.searchParams.get("key") !== admin) return json({ ok: false, action, error: "권한이 없습니다" }, 403);
      const shared = await sharedAccountSession();
      const items: unknown[] = [];
      for (const l of await listLoans(shared)) {
        const xml = await ebPost(shared, "/process/contentReturnProc.xml", { lbryCode: LBRY, loanSrmb: l.loanSrmb });
        items.push({ loanSrmb: l.loanSrmb, title: l.title, ok: xmlTag(xml, "result") === "True" });
      }
      return json({ ok: true, action, returned: items.filter((i) => (i as { ok: boolean }).ok).length, items });
    }

    // 개인 신원 — SSO 토큰의 sid로 저장된 포털 연계값을 꺼내 lib 로그인 → 전자도서관 연계폼(user_id)까지 얻는다.
    // 여기서 못 얻으면 그대로 막는다. 공유계정으로 대신 처리하지 않는다(위 헤더 주석 참고).
    // 9/8: 전자도서관 개인세션(mmbrLnkg)은 필요한 액션(borrow·viewer·status·reserve·폴백)에서만 만든다 — 정식 API 액션은 user_id만 있으면 된다.
    let hand: EbookHandoff | null = null;
    const ses = await sessionFromRequest(req);
    if (ses) {
      const row = await loadSession(ses.sid);
      if (row?.school_no && row?.portal_user_id) {
        // 9/14 실측: 대출 직후 반납처럼 연달아 부르면 포털→lib 체인이 한 번 헛돌 때가 있다(다음 호출은 정상).
        //   그 한 번이 학생에겐 "계정 연결이 필요해요"로 보이므로 한 번 더 시도한다.
        for (let attempt = 1; attempt <= 2 && !hand; attempt++) {
          try {
            const lib = await libLoginByPortal({ school_no: row.school_no, portal_user_id: row.portal_user_id });
            hand = await fetchEbookHandoff(lib);
          } catch (e) { console.error(`personal handoff fail (${attempt}/2)`, String(e)); }
        }
      }
    }
    if (!hand || !hand.user_id) {
      return json({
        ok: false, action, personal: false, needsPersonal: true,
        error: "도서관 계정 연결이 필요해요",
      }, 409);
    }
    const personal = true;
    const userId = hand.user_id;
    let _jar: Jar | null = null;
    const getJar = async (): Promise<Jar> => { if (!_jar) _jar = await ebookSession(hand!); return _jar; };

    if (action === "status") {
      const body = await ebGet(await getJar(), "/main/userBorrowStatus.json");
      return json({ ok: true, action, personal, status: JSON.parse(body || "{}") });
    }

    // 내가 빌린 전자책 — 우리 도서관 화면이 종이책과 함께 한 줄로 보여주기 위한 목록
    // 9/8: 교보 정식 대출내역 API. 항목에 loanSrmb 는 없다("") — 반납·연장은 바코드로, 뷰어 열기는 서버가 그때 찾는다.
    if (action === "myLoans") {
      try {
        return json({ ok: true, action, personal, source: "api", items: await kyoboBorrowList(userId) });
      } catch (e) {
        console.error("myLoans api fail → html", String(e).slice(0, 120));
        return json({ ok: true, action, personal, source: "html", items: await listLoans(await getJar()) });
      }
    }

    // 이미 빌린 책 다시 열기 — 도서관 사이트의 '바로보기'에 해당.
    // 대출 때 받은 viewerUrl은 그 순간의 세션에 묶여 있어 재사용이 안 된다. 그래서 매번 새로 만든다.
    // ⚠️ 이게 없으면 탭을 한 번 닫는 순간 북스타 안에서 그 책을 다시 열 길이 사라진다(5일 대출인데).
    if (action === "viewer") {
      const loanSrmb = (url.searchParams.get("loanSrmb") || "").replace(/[^0-9]/g, "");
      if (!loanSrmb && !brcd) return json({ ok: false, action, error: "loanSrmb 또는 brcd 필요" }, 400);
      // 내 대출 목록에 있는 책만 연다 — 남의 대출번호를 넣어 여는 걸 막고,
      // 이미 반납·만료된 책은 "왜 안 열리지" 대신 이유를 말해 준다.
      // 9/8: 정식 API 목록엔 대출번호가 없어 앱이 바코드만 보내온다 → 여기서(열 때 한 번만) 도서관 대출현황에서 번호를 찾는다.
      const jar = await getJar();
      const mine = (await listLoans(jar)).find((l) => loanSrmb ? l.loanSrmb === loanSrmb : l.brcd === brcd);
      if (!mine) {
        return json({ ok: false, action, personal, message: "대출 목록에 없는 책이에요 — 기간이 끝났거나 이미 반납됐어요" });
      }
      const v = await viewerUrlFor(jar, mine.loanSrmb, mine.brcd || brcd, (url.searchParams.get("device") || "") === "m");
      if (!v.url) {
        console.error("viewer fail", loanSrmb, v.vendor, v.error);
        return json({ ok: false, action, personal, vendor: v.vendor, message: `뷰어를 열지 못했어요 — ${v.error || "잠시 후 다시 시도해 주세요"}` });
      }
      return json({ ok: true, action, personal, loanSrmb: mine.loanSrmb, viewerUrl: v.url, vendor: v.vendor, dueDate: mine.dueDate || "" });
    }

    // 반납은 loanSrmb만으로 성립 — brcd 요구는 borrow에만.
    // (구버전은 return에도 brcd를 요구해 앱의 반납 버튼이 400으로 실패하고 있었음)
    if (action === "borrow" && !brcd) return json({ ok: false, error: "brcd 필요" }, 400);

    if (action === "borrow") {
      // 한도(5권) 초과여도 자동반납은 하지 않는다 — 본인 책이므로 안내만 하고 직접 고르게 한다.
      // (공유계정 시절의 "가장 오래된 1권 강제 반납"은 남이 읽던 책을 끊어서 8/9에 폐지)
      const jar = await getJar();
      const res = await doBorrow(jar, brcd);
      if (!res.ok) return json({ ok: false, action, personal, message: res.msg });
      notifyStockChanged(brcd);   // 8/22: 빌린 순간 홈에서 빠지게
      // 뷰어URL 실패해도 대출은 유효 — 다만 왜 못 열었는지는 viewerError로 같이 보내 앱이 말하게 한다(8/21: 조용한 실패 금지)
      let viewerUrl = "", vendor = "", viewerError = "";
      try { const v = await viewerUrlFor(jar, res.loanSrmb, brcd, (url.searchParams.get("device") || "") === "m"); viewerUrl = v.url; vendor = v.vendor; viewerError = v.error || ""; }
      catch (e) { viewerError = "뷰어 발급 중 오류: " + String(e).slice(0, 80); }
      // 📌 8/22 "방금 빌린 책은 표지만 뜨고 멈춤 → 이어보기면 열림" 신고는 8/23에 원인 확정: 솔숲 앱의 상세 화면 대출 호출만
      //   device=m을 빠뜨려 PC용(type=web) 토큰이 나갔던 것(이어보기는 device=m). 앱 쪽 수정으로 해결.
      //   여기 있던 "1.5초 후 재발급" 완화는 원인과 무관하고 대출만 느리게 해서 걷어냈다(8/23).
      if (!viewerUrl) console.error("borrow ok but viewer fail", res.loanSrmb, vendor, viewerError);
      // 반납예정일은 도서관이 정한 값을 그대로 읽어 온다.
      // ⚠️ 예전엔 "대출기간 14일"이라고 박아 뒀는데 **실측 5일**이었다(8/9: 8/9 대출 → 8/14 반납예정).
      //    기간은 도서관 정책이라 우리가 알 수 없다 — 숫자를 짐작하지 말고 실제 날짜를 보여준다.
      let dueDate = "";
      try { dueDate = (await listLoans(jar)).find((l) => l.loanSrmb === res.loanSrmb)?.dueDate || ""; }
      catch (_) { /* 못 읽으면 날짜 없이 안내 */ }
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
      return json({
        ok: true, action, personal, loanSrmb: res.loanSrmb, entsDvsnCode: res.ents, viewerUrl, vendor, viewerError, dueDate,
        message: dm
          ? `대출 완료 — ${+dm[2]}월 ${+dm[3]}일까지 읽을 수 있어요`
          : "대출 완료 — 읽고 나면 반납해 주세요",
      });
    }

    // 반납·연장 — 옛 세션 경로(/process/*)로 처리한다.
    //   9/11 실측: 정식 처리 API(frontapi)에 연계폼 user_id를 넘기면 NOT_EXIST_MEMBER_INFO("회원이 존재하지 않습니다")로
    //   전부 실패했다(세명대 9/10 수정요청). 교보가 기대하는 user_id가 확인될 때까지 검증된 세션 경로만 쓴다.
    //   정식 API 목록엔 대출번호가 없어 앱은 바코드만 보낸다 → 뷰어와 같은 방식으로 대출현황에서 번호를 찾는다.
    if (action === "return" || action === "extend") {
      let loanSrmb = (url.searchParams.get("loanSrmb") || "").replace(/[^0-9]/g, "");
      if (!loanSrmb && !brcd) return json({ ok: false, action, error: "brcd 또는 loanSrmb 필요" }, 400);
      const jar = await getJar();
      let bc = brcd;
      if (!loanSrmb) {
        const mine = (await listLoans(jar)).find((l) => l.brcd === brcd);
        if (!mine) return json({ ok: false, action, personal, message: "대출 목록에 없는 책이에요 — 기간이 끝났거나 이미 반납됐어요" });
        loanSrmb = mine.loanSrmb; bc = mine.brcd || brcd;
      }
      const path = action === "return" ? "/process/contentReturnProc.xml" : "/process/contentExtendProc.xml";
      const xml = await ebPost(jar, path, { lbryCode: LBRY, loanSrmb, brcd: bc, epdeBrcd: "" });
      const okRR = xmlTag(xml, "result") === "True";
      if (okRR && action === "return" && bc) notifyStockChanged(bc);   // 8/22: 반납한 순간 홈에 돌아오게
      if (!okRR) console.error(action, "session false", bc, xmlTag(xml, "msg").slice(0, 80));
      return json({
        ok: okRR, action, personal, source: "session", loanSrmb,
        message: okRR ? "" : ((xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " ") || (action === "return" ? "반납하지 못했어요" : "연장하지 못했어요")),
      });
    }

    // 내가 예약한 전자책 — 9/8 교보 정식 예약내역 API(순번·우선예약 포함). 예약번호(prenSrmb)는 없다("") — 취소는 바코드로.
    if (action === "myReserves") {
      try {
        return json({ ok: true, action, personal, source: "api", items: await kyoboReserveList(userId) });
      } catch (e) {
        console.error("myReserves api fail → html", String(e).slice(0, 120));
        return json({ ok: true, action, personal, source: "html", items: await listReserves(await getJar()) });
      }
    }

    // 전권 대출중인 전자책 예약 — 반납되면 순번대로 (옛 세션 경로 유지)
    if (action === "reserve") {
      if (!brcd) return json({ ok: false, error: "brcd 필요" }, 400);
      // ⚠️ dvsnCode:"W"(웹) 필수 — 빼면 조용히 실패한다(도서관 스크립트 실측)
      const xml = await ebPost(await getJar(), "/process/contentReserveProc.xml", { lbryCode: LBRY, brcd, epdeBrcd: "", dvsnCode: "W" });
      return json({
        ok: xmlTag(xml, "result") === "True", action, personal,
        message: (xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " "),
      });
    }
    // 예약취소 — 옛 세션 경로(예약번호). 9/11: 정식 API(frontapi)는 회원 인식 실패(위 반납 주석 참고).
    //   앱은 바코드만 보내므로 예약현황에서 예약번호를 찾는다.
    if (action === "cancelReserve") {
      let prenSrmb = (url.searchParams.get("prenSrmb") || "").replace(/[^0-9]/g, "");
      if (!prenSrmb && !brcd) return json({ ok: false, action, error: "brcd 또는 prenSrmb 필요" }, 400);
      const jar = await getJar();
      if (!prenSrmb) {
        const mine = (await listReserves(jar)).find((r) => r.brcd === brcd);
        if (!mine) return json({ ok: false, action, personal, message: "예약 목록에 없는 책이에요 — 이미 취소됐거나 대출로 넘어갔어요" });
        prenSrmb = mine.prenSrmb;
      }
      const xml = await ebPost(jar, "/process/contentReserveCancelProc.xml", { lbryCode: LBRY, prenSrmb });
      const okC = xmlTag(xml, "result") === "True";
      if (!okC) console.error("cancelReserve session false", brcd, xmlTag(xml, "msg").slice(0, 80));
      return json({
        ok: okC, action, personal, source: "session",
        message: okC ? "" : ((xmlTag(xml, "msg") || "").replace(/<br\s*\/?>/gi, " ") || "예약을 취소하지 못했어요"),
      });
    }

    return json({ ok: false, error: "unknown action" }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
